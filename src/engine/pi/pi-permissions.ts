import { realpath } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent"
import type { BotPermissionMode } from "@src/shared/bot-permissions"
import type { PermissionDecision, PermissionRequest } from "@src/shared/permissions"
import { askTool, finishSilentlyTool, sendMessageTool } from "@src/shared/conversations"
import { connectPluginTool } from "@src/shared/plugins"
import { delegateTool, transferTool, reportTaskTool } from "@src/shared/tasks"
import { webFetchTool, webSearchTool } from "../web/web-search"
import { historyTools } from "@src/shared/history"

interface PiPermissionPolicyBase {
  botId: string
  allowedRoot: string
  botDirectory?: string
  labels?: Record<string, string>
}

export type PiPermissionPolicy =
  | (PiPermissionPolicyBase & { mode: Extract<BotPermissionMode, "ask">; request(request: PermissionRequest, signal?: AbortSignal): Promise<PermissionDecision> })
  | (PiPermissionPolicyBase & { mode: Extract<BotPermissionMode, "read-only"> })
  | (PiPermissionPolicyBase & { mode: Extract<BotPermissionMode, "full"> })

const observationTools = new Set(["read", "grep", "find", "ls"])
const conversationTools = [askTool, sendMessageTool, finishSilentlyTool, reportTaskTool]
const readOnlyTools = new Set([...observationTools, ...conversationTools, webSearchTool, webFetchTool, "search_memories", ...Object.values(historyTools)])
const exemptTools = new Set(["list_models", connectPluginTool, delegateTool, transferTool, ...conversationTools, webSearchTool, webFetchTool, "search_memories", ...Object.values(historyTools)])
const detailFields: Record<string, string> = { bash: "command", hire: "name", configure_member: "bot", remove_routine: "id", routine: "content" }
const briefFields: Record<string, string> = { hire: "instructions", routine: "frequency" }

export function toolsForPermissionMode(mode: BotPermissionMode, tools: string[]) {
  if (mode !== "read-only") {
    return tools
  }

  return tools.filter((tool) => readOnlyTools.has(tool))
}

async function pathIsInside(root: string, path: unknown) {
  if (typeof path !== "string") {
    return false
  }

  const target = resolve(root, path)
  const lexicalDistance = relative(root, target)
  const lexicallyInside = lexicalDistance !== ".." && !lexicalDistance.startsWith(`..${sep}`) && !isAbsolute(lexicalDistance)

  if (!lexicallyInside) {
    return false
  }

  const canonicalPaths = await Promise.all([realpath(root), realpath(target)]).catch(() => {})

  if (!canonicalPaths) {
    return false
  }

  const [canonicalRoot, canonicalTarget] = canonicalPaths
  const canonicalDistance = relative(canonicalRoot, canonicalTarget)

  return canonicalDistance !== ".." && !canonicalDistance.startsWith(`..${sep}`) && !isAbsolute(canonicalDistance)
}

function readDetail(input: unknown, field?: string) {
  if (!field || !input || typeof input !== "object" || Array.isArray(input)) {
    return
  }

  const value = Reflect.get(input, field)

  if (typeof value !== "string") {
    return
  }

  if (!value.trim()) {
    return
  }

  return value
}

function describeToolCall(id: string, tool: string, input: unknown, label?: string, cwd?: string): PermissionRequest {
  if (label) {
    const values = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {}

    return { id, tool, label, arguments: values }
  }

  const detail = readDetail(input, detailFields[tool] ?? "path")
  const brief = readDetail(input, briefFields[tool])
  const edit = tool === "edit" ? { oldText: readDetail(input, "oldText"), newText: readDetail(input, "newText") } : undefined

  return { id, tool, ...(edit ? { arguments: edit } : {}), ...(detail ? { detail } : {}), ...(brief ? { brief } : {}), ...(tool === "bash" && cwd ? { cwd } : {}) }
}

async function observesInside(policy: Pick<PiPermissionPolicy, "allowedRoot" | "botDirectory">, input: unknown) {
  const path = typeof input === "object" && input !== null ? Reflect.get(input, "path") ?? "." : undefined

  if (await pathIsInside(policy.allowedRoot, path)) {
    return true
  }

  return !!policy.botDirectory && typeof path === "string" && await pathIsInside(policy.botDirectory, resolve(policy.allowedRoot, path))
}

export async function authorizeToolCall(policy: PiPermissionPolicy, tool: string, input: unknown, callId: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  if (policy.mode === "full") {
    return { allowed: true as const }
  }

  const observes = observationTools.has(tool)
  const inside = observes && await observesInside(policy, input)

  if (inside) {
    return { allowed: true as const }
  }

  if (policy.mode === "read-only") {
    if (observes) {
      return { allowed: false as const, reason: "path_outside_root" as const }
    }

    if (readOnlyTools.has(tool)) {
      return { allowed: true as const }
    }

    return { allowed: false as const, reason: "missing_permission" as const }
  }

  if (exemptTools.has(tool)) {
    return { allowed: true as const }
  }

  const decision = await policy.request(describeToolCall(callId, tool, input, policy.labels?.[tool], policy.allowedRoot), signal)

  if (decision === "denied") {
    return { allowed: false as const, reason: "person_denied" as const }
  }

  return { allowed: true as const, asked: true as const }
}

const blockReasons = {
  missing_permission: "Your permission mode does not allow this tool. Tell the person what you could not do; they can change the mode in your settings.",
  path_outside_root: "The path is outside your working directory and private Bot directory. In this mode you can only read inside those directories.",
  person_denied: "The person denied this action. That is their decision, not an error. Do not retry it and do not do the same thing another way. Tell the person in one line what you did not do and ask how they want to continue.",
}

export function createPermissionExtension(policy: PiPermissionPolicy): InlineExtension {
  return {
    name: `permissions-${policy.botId}`,
    factory(pi: ExtensionAPI) {
      const asked = new Set<string>()

      pi.on("tool_call", async (event) => {
        const authorization = await authorizeToolCall(policy, event.toolName, event.input, event.toolCallId)

        if (!authorization.allowed) {
          return { block: true, reason: blockReasons[authorization.reason] }
        }

        if (authorization.asked) {
          asked.add(event.toolCallId)
        }
      })

      pi.on("tool_result", (event) => {
        const decided = asked.delete(event.toolCallId)

        if (!decided || event.isError) {
          return
        }

        const [first, ...rest] = event.content

        if (first?.type === "text") {
          return { content: [{ type: "text", text: `The person allowed this action.\n\n${first.text}` }, ...rest] }
        }

        return { content: [{ type: "text", text: "The person allowed this action." }, ...event.content] }
      })
    },
  }
}
