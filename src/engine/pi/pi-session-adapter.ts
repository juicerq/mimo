import { Type } from "@earendil-works/pi-ai"
import {
  calculateContextTokens,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionAPI,
  type InlineExtension,
} from "@earendil-works/pi-coding-agent"
import type { AssistantMessage, TSchema } from "@earendil-works/pi-ai"
import { existsSync } from "node:fs"
import { basename, join } from "node:path"
import { createPermissionExtension } from "./pi-permissions"
import { createMessagingExtension } from "./pi-messaging"
import { describePiFailure } from "./pi-failures"
import { expandPiSkills, loadPiSkills } from "./pi-skills"
import { sendMessageTool } from "@src/shared/conversations"
import type { ObservationAttributes } from "@src/shared/observability/observation"
import type { Observability } from "../observability/observability"
import type { PiModels } from "./pi-models"
import type { PiRuntimeEvent, PiSessionFactory, PiTool } from "./pi-agent-runtime"
import { z } from "zod"

const toolProgress = z.object({ label: z.string(), detail: z.string(), brief: z.string() })

interface Measurement {
  name: string
  attributes: ObservationAttributes
  error?: Error
}

const detailFields: Record<string, string> = { bash: "command", grep: "pattern", find: "pattern", delegate: "bot", transfer: "bot", hire: "name", configure_member: "bot", browser: "action" }
const briefFields: Record<string, string> = { delegate: "instructions", hire: "instructions", transfer: "instructions", routine: "content" }

function toolSchema(tool: PiTool): TSchema {
  if ("inputSchema" in tool) {
    return tool.inputSchema as TSchema
  }

  return Type.Object(Object.fromEntries(Object.entries(tool.parameters).map(([name, description]) => name.endsWith("?")
    ? [name.slice(0, -1), Type.Optional(Type.String({ description }))]
    : [name, Type.String({ description })])))
}

function toPiTool(tool: PiTool) {
  return defineTool({
    name: tool.name,
    label: tool.label ?? tool.name,
    description: tool.description,
    parameters: toolSchema(tool),
    async execute(_toolCallId, params, signal, onUpdate) {
      const text = "inputSchema" in tool ? await tool.execute(params as Record<string, unknown>, signal, (progress) => onUpdate?.({ content: [{ type: "text", text: progress.detail }], details: { progress } })) : await tool.execute(params as Record<string, string>, signal)

      return { content: [{ type: "text", text }], details: {} }
    },
  })
}

function createToolRegistrar(botId: string) {
  let api: ExtensionAPI | undefined
  const extension: InlineExtension = {
    name: `tools-${botId}`,
    factory(pi: ExtensionAPI) {
      api = pi
    },
  }

  return {
    extension,
    add(tools: PiTool[]) {
      if (!api) {
        throw new Error("Pi session is not loaded")
      }

      for (const tool of tools) {
        api.registerTool(toPiTool(tool))
      }

      api.setActiveTools([...new Set([...api.getActiveTools(), ...tools.map((tool) => tool.name)])])
    },
  }
}

type AssistantMessageEvent = Extract<AgentSessionEvent, { type: "message_update" }>["assistantMessageEvent"]

function normalizeMessageUpdate(event: AssistantMessageEvent): PiRuntimeEvent | undefined {
  if (event.type === "text_delta") {
    return { type: "text", text: event.delta }
  }

  if (event.type === "thinking_start") {
    return { type: "thinking-started" }
  }

  if (event.type === "thinking_delta") {
    return { type: "thinking", text: event.delta }
  }

  if (event.type === "thinking_end") {
    return { type: "thinking-finished" }
  }

  return
}

function normalizeStateless(event: AgentSessionEvent): PiRuntimeEvent | undefined {
  if (event.type === "tool_execution_update") {
    const parsed = z.object({ details: z.object({ progress: toolProgress }) }).safeParse(event.partialResult)

    if (parsed.success) {
      return { type: "tool-progress", callId: event.toolCallId, tool: event.toolName, ...parsed.data.details.progress }
    }
  }
  if (event.type === "message_update") {
    return normalizeMessageUpdate(event.assistantMessageEvent)
  }

  if (event.type === "tool_execution_start") {
    const detail = summarizeToolInput(event.args, detailFields[event.toolName] ?? "path")
    const brief = summarizeToolInput(event.args, briefFields[event.toolName])

    return { type: "tool-started", callId: event.toolCallId, tool: event.toolName, ...(detail ? { detail } : {}), ...(brief ? { brief } : {}) }
  }

  if (event.type === "tool_execution_end") {
    const error = event.isError ? summarizeToolError(event.result) : undefined

    return { type: "tool-finished", callId: event.toolCallId, tool: event.toolName, failed: event.isError, ...(error ? { error } : {}) }
  }

  if (event.type === "compaction_start") {
    return { type: "compaction-started", reason: event.reason }
  }

  if (event.type === "compaction_end") {
    return { type: "compaction-finished" }
  }

  return
}

function createEventNormalizer() {
  let lastReason: "stop" | "aborted" | "error" = "error"
  let lastError: string | undefined
  let interrupted = false
  let active = false

  function normalize(event: AgentSessionEvent): PiRuntimeEvent | undefined {
    if (event.type === "agent_start") {
      lastReason = "error"
      lastError = undefined

      if (active) {
        return { type: "provider-resumed" }
      }

      active = true
      interrupted = false

      return { type: "started" }
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      finishMessage(event.message)

      return
    }

    if (event.type === "agent_settled") {
      const reason = interrupted && lastReason !== "stop" ? "aborted" : lastReason
      active = false

      return { type: "finished", reason, ...(reason === "error" && lastError ? { error: lastError } : {}) }
    }

    if (event.type === "auto_retry_start" || event.type === "summarization_retry_scheduled") {
      return { type: "provider-waiting", attempt: event.attempt, maxAttempts: event.maxAttempts, delayMs: event.delayMs }
    }

    if (event.type === "auto_retry_end" || event.type === "summarization_retry_attempt_start" || event.type === "summarization_retry_finished") {
      return { type: "provider-resumed" }
    }

    return normalizeStateless(event)
  }

  function finishMessage(message: AssistantMessage) {
    lastReason = message.stopReason === "stop" || message.stopReason === "aborted" ? message.stopReason : "error"
    lastError = message.errorMessage?.trim().slice(0, 500) || undefined
  }

  return {
    normalize,
    abort() {
      interrupted = true
    },
  }
}

function usageMeasurement(message: AssistantMessage): Measurement | undefined {
  const { usage } = message
  const tokens = calculateContextTokens(usage)

  if (tokens === 0) {
    return
  }

  return {
    name: "pi.usage",
    attributes: {
      model: message.model,
      state: message.stopReason,
      tokens,
      inputTokens: usage.input,
      outputTokens: usage.output,
      cacheReadTokens: usage.cacheRead,
      cacheWriteTokens: usage.cacheWrite,
      cost: usage.cost.total,
    },
  }
}

function contextMeasurement(session: Pick<AgentSession, "getContextUsage">): Measurement | undefined {
  const usage = session.getContextUsage()

  if (!usage || usage.tokens === null || usage.percent === null) {
    return
  }

  return { name: "pi.context", attributes: { tokens: usage.tokens, contextWindow: usage.contextWindow, percent: usage.percent } }
}

function compactionState(event: Extract<AgentSessionEvent, { type: "compaction_end" }>) {
  if (event.aborted) {
    return "aborted"
  }

  if (event.errorMessage) {
    return "failed"
  }

  return "done"
}

function compactionMeasurement(event: Extract<AgentSessionEvent, { type: "compaction_end" }>): Measurement {
  const { result } = event

  return {
    name: "pi.compaction",
    attributes: {
      reason: event.reason,
      state: compactionState(event),
      ...(result ? { tokens: result.tokensBefore, bytes: Buffer.byteLength(result.summary) } : {}),
      ...(result?.usage ? { inputTokens: result.usage.input, outputTokens: result.usage.output, cost: result.usage.cost.total } : {}),
    },
    ...(event.errorMessage ? { error: new Error(event.errorMessage) } : {}),
  }
}

function toolMeasurement(event: Extract<AgentSessionEvent, { type: "tool_execution_end" }>): Measurement {
  const bytes = textBlocks(event.result).reduce((total, block) => total + Buffer.byteLength(block.text), 0)

  return { name: "pi.tool", attributes: { tool: event.toolName, state: event.isError ? "failed" : "done", bytes } }
}

function measure(event: AgentSessionEvent, session: Pick<AgentSession, "getContextUsage">) {
  if (event.type === "auto_retry_start" || event.type === "summarization_retry_scheduled") {
    return { name: "pi.retry", attributes: { count: event.attempt, state: "waiting" }, error: new Error(event.errorMessage) }
  }

  if (event.type === "message_end" && event.message.role === "assistant") {
    if (event.message.stopReason === "error") {
      return { name: "pi.responsefailed", attributes: { model: event.message.model }, error: new Error(event.message.errorMessage) }
    }

    return usageMeasurement(event.message)
  }

  if (event.type === "tool_execution_end") {
    return toolMeasurement(event)
  }

  if (event.type === "agent_settled") {
    return contextMeasurement(session)
  }

  if (event.type === "compaction_end") {
    return compactionMeasurement(event)
  }

  return
}

function summarizeToolInput(input: unknown, field?: string) {
  if (!field || !input || typeof input !== "object" || Array.isArray(input)) {
    return
  }

  const values = input as Record<string, unknown>
  const value = values[field]

  if (typeof value !== "string") {
    return
  }

  const summary = value.replace(/\s+/g, " ").trim()

  if (!summary) {
    return
  }

  return truncate(summary, 160)
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) {
    return value
  }

  return `${value.slice(0, limit - 3)}...`
}

function textBlocks(result: unknown) {
  const content: unknown[] = result && typeof result === "object" && "content" in result && Array.isArray(result.content) ? result.content : []

  return content.filter((block): block is { type: "text"; text: string } => !!block && typeof block === "object" && Reflect.get(block, "type") === "text" && typeof Reflect.get(block, "text") === "string")
}

function summarizeToolError(result: unknown) {
  const summary = textBlocks(result)[0]?.text.split(/\n\s*\n/, 1)[0]?.trim() ?? ""

  if (!summary) {
    return
  }

  return truncate(summary, 300)
}

function openSessionManager(sessionsDirectory: string, cwd: string, sessionFile?: string, ephemeral?: boolean) {
  if (ephemeral) {
    return SessionManager.inMemory(cwd)
  }

  if (!sessionFile) {
    return SessionManager.create(cwd, sessionsDirectory)
  }

  const sessionPath = join(sessionsDirectory, basename(sessionFile))
  const sessionExists = existsSync(sessionPath)

  if (!sessionExists) {
    return SessionManager.create(cwd, sessionsDirectory)
  }

  return SessionManager.open(sessionPath, sessionsDirectory, cwd)
}

export function createPiSessionFactory(options: { agentDirectory: string; sessionsDirectory: string; models: PiModels; observability: Observability }): PiSessionFactory {
  return {
    async open(input) {
      const context = { botId: input.botId, provider: input.provider }
      const { model, modelRuntime } = await options.models.resolve(input.provider, input.model)
      const registrar = createToolRegistrar(input.botId)
      const skills = await loadPiSkills(input.cwd)
      const loader = new DefaultResourceLoader({
        cwd: input.cwd,
        agentDir: options.agentDirectory,
        extensionFactories: [createPermissionExtension(input.policy), registrar.extension, ...(input.tools.includes(sendMessageTool) ? [createMessagingExtension(input.tools)] : [])],
        noSkills: true,
        skillsOverride: () => skills,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        ...(input.instructions ? { systemPrompt: input.instructions } : {}),
      })
      await loader.reload()
      const sessionManager = openSessionManager(options.sessionsDirectory, input.cwd, input.sessionFile, input.ephemeral)
      const result = await createAgentSession({
        cwd: input.cwd,
        model,
        modelRuntime,
        thinkingLevel: input.effort,
        resourceLoader: loader,
        sessionManager,
        settingsManager: SettingsManager.inMemory(),
        customTools: (input.customTools ?? []).map(toPiTool),
      })
      result.session.setActiveToolsByName(input.tools)
      const normalizer = createEventNormalizer()
      let recoveryTimer: ReturnType<typeof setTimeout> | undefined
      let recoveryExpired = false

      function clearRecovery() {
        clearTimeout(recoveryTimer)
        recoveryTimer = undefined
      }

      function trackRecovery(event: AgentSessionEvent) {
        if (event.type === "auto_retry_start" || event.type === "summarization_retry_scheduled") {
          recoveryTimer ??= setTimeout(() => {
            recoveryExpired = true
            void result.session.abort().catch((error: unknown) => {
              options.observability.event({ name: "pi.recoveryabortfailed", context, error })
            })
          }, 60_000)
        }

        if (event.type === "auto_retry_end" || event.type === "summarization_retry_finished" || event.type === "agent_settled") {
          clearRecovery()
        }
      }

      return {
        sessionFile: result.session.sessionFile ? basename(result.session.sessionFile) : undefined,
        async compact(customInstructions) {
          const compacted = await result.session.compact(customInstructions)

          return {
            tokensBefore: compacted.tokensBefore,
            ...(compacted.estimatedTokensAfter === undefined ? {} : { estimatedTokensAfter: compacted.estimatedTokensAfter }),
          }
        },
        async prompt({ content, images = [], context }) {
          recoveryExpired = false

          if (context) {
            await result.session.sendCustomMessage({ customType: "mimo.turn-context", content: `Mimo context for the next message:\n${JSON.stringify(context)}`, display: false })
          }

          return result.session.prompt(await expandPiSkills(content, loader.getSkills().skills), { images: images.map((image) => ({ type: "image", ...image })) })
        },
        async steer({ content, images = [] }) {
          return result.session.steer(await expandPiSkills(content, loader.getSkills().skills), images.map((image) => ({ type: "image", ...image })))
        },
        abort() {
          clearRecovery()
          recoveryExpired = false
          normalizer.abort()

          return result.session.abort()
        },
        addTools: (tools) => registrar.add(tools),
        subscribe(listener) {
          return result.session.subscribe((event) => {
            trackRecovery(event)
            const measurement = measure(event, result.session)

            if (measurement) {
              options.observability.event({ ...measurement, context })
            }

            const normalized = normalizer.normalize(event)

            if (normalized) {
              if (normalized.type === "finished" && recoveryExpired) {
                listener({ type: "finished", reason: "error", error: "O provedor não voltou a responder após um minuto de recuperação. Você pode tentar novamente ou trocar o modelo." })
                return
              }

              if (normalized.type === "finished" && normalized.error) {
                normalized.error = describePiFailure(normalized.error, input.provider)
              }

              listener(normalized)
            }
          })
        },
        dispose() {
          clearRecovery()
          result.session.dispose()
        },
      }
    },
  }
}
