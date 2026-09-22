import type { BotEffort } from "@src/shared/bots"
import type { BotPermissionMode } from "@src/shared/bot-permissions"
import type { ConversationCompactionResult, MessageImage, TurnContext } from "@src/shared/conversations"
import type { PermissionDecision, PermissionRequest } from "@src/shared/permissions"
import type { ProviderName } from "@src/shared/providers"
import type { Observability } from "../observability/observability"
import type { PiPermissionPolicy } from "./pi-permissions"
import { authorizeToolCall } from "./pi-permissions"

export type PiRuntimeEvent =
  | { type: "started" }
  | { type: "provider-waiting"; attempt: number; maxAttempts: number; delayMs: number }
  | { type: "provider-resumed" }
  | { type: "text"; text: string }
  | { type: "message-finished"; reason?: "aborted" | "error"; error?: string }
  | { type: "thinking-started" }
  | { type: "thinking"; text: string }
  | { type: "thinking-finished" }
  | { type: "tool-started"; callId: string; tool: string; label?: string; detail?: string; brief?: string }
  | { type: "tool-progress"; callId: string; tool: string; label: string; detail: string; brief: string }
  | { type: "tool-finished"; callId: string; tool: string; failed: boolean; denied?: boolean; error?: string }
  | { type: "permission-requested"; request: PermissionRequest }
  | { type: "permission-resolved"; requestId: string }
  | { type: "compaction-started"; reason: "manual" | "threshold" | "overflow" }
  | { type: "compaction-finished" }
  | { type: "finished"; reason: "stop" | "aborted" | "error"; error?: string }

interface ToolInputSchema {
  type: "object"
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export interface PiCustomTool {
  name: string
  description: string
  label?: string
  parameters: Record<string, string>
  execute(params: Record<string, string>, signal?: AbortSignal): Promise<string>
}

export interface PiSchemaTool {
  name: string
  description: string
  label?: string
  inputSchema: ToolInputSchema
  execute(params: Record<string, unknown>, signal?: AbortSignal, progress?: (update: { label: string; detail: string; brief: string }) => void): Promise<string>
}

export type PiTool = PiCustomTool | PiSchemaTool

export interface PiPrompt {
  content: string
  images?: MessageImage[]
  context?: TurnContext
}

export interface PiSession {
  sessionFile?: string
  compact(customInstructions?: string): Promise<ConversationCompactionResult>
  prompt(input: PiPrompt): Promise<void>
  steer(input: Pick<PiPrompt, "content" | "images">): Promise<void>
  abort(): Promise<void>
  addTools?(tools: PiTool[]): void
  subscribe(listener: (event: PiRuntimeEvent) => void): () => void
  dispose(): void
}

function toolLabels(tools: PiTool[]) {
  return Object.fromEntries(tools.flatMap((tool) => tool.label ? [[tool.name, tool.label]] : []))
}

export interface PiSessionInput {
  botId: string
  cwd: string
  botDirectory?: string
  tools: string[]
  provider: ProviderName
  effort: BotEffort
  model: string | null
  policy: PiPermissionPolicy
  customTools?: PiTool[]
  sessionFile?: string
  instructions?: string
  ephemeral?: boolean
}

export interface PiSessionFactory {
  open(input: PiSessionInput): Promise<PiSession>
}

export function deferPiSessionFactory(load: () => Promise<PiSessionFactory>): PiSessionFactory & { warm(): Promise<PiSessionFactory> } {
  let loading: Promise<PiSessionFactory> | undefined

  function warm() {
    loading ??= load().catch((error: unknown) => {
      loading = undefined

      throw error
    })

    return loading
  }

  return {
    warm,
    async open(input) {
      const factory = await warm()

      return factory.open(input)
    },
  }
}

export function createPiAgentRuntime(sessionFactory: PiSessionFactory, observability: Observability) {
  const sessions = new Map<string, { session: PiSession; provider: ProviderName; policy: PiPermissionPolicy; unsubscribe: () => void; listeners: Set<(event: PiRuntimeEvent) => void> }>()
  const pending = new Map<string, { botId: string; request: PermissionRequest; resolve(decision: PermissionDecision): void }>()
  const denied = new Set<string>()

  function existing(botId: string) {
    const entry = sessions.get(botId)

    if (!entry) {
      throw new Error("Pi session not found")
    }

    return entry
  }

  function pendingKey(botId: string, requestId: string) {
    return `${botId}:${requestId}`
  }

  function annotate(botId: string, policy: PiPermissionPolicy, event: PiRuntimeEvent): PiRuntimeEvent {
    if (event.type === "tool-started") {
      const label = policy.labels?.[event.tool]

      if (!label) {
        return event
      }

      return { ...event, label }
    }

    if (event.type === "tool-finished" && denied.delete(pendingKey(botId, event.callId))) {
      return { ...event, denied: true }
    }

    return event
  }

  function deliver(botId: string, event: PiRuntimeEvent) {
    for (const listener of sessions.get(botId)?.listeners ?? []) {
      listener(event)
    }
  }

  function denyPending(botId: string) {
    for (const [key, request] of pending) {
      if (request.botId === botId) {
        pending.delete(key)
        denied.add(key)
        request.resolve("denied")
      }
    }
  }

  function close(botId: string) {
    const entry = sessions.get(botId)

    if (!entry) {
      return
    }

    denyPending(botId)
    entry.unsubscribe()
    entry.session.dispose()
    sessions.delete(botId)

    for (const key of denied) {
      if (key.startsWith(`${botId}:`)) {
        denied.delete(key)
      }
    }
  }

  return {
    async open(input: Omit<PiSessionInput, "policy"> & { permissionMode: BotPermissionMode }) {
      close(input.botId)
      const policy: PiPermissionPolicy = {
        botId: input.botId,
        allowedRoot: input.cwd,
        ...(input.botDirectory ? { botDirectory: input.botDirectory } : {}),
        mode: input.permissionMode,
        labels: toolLabels(input.customTools ?? []),
        request: (request, signal) => new Promise<PermissionDecision>((resolve) => {
          const key = pendingKey(input.botId, request.id)
          const finish = (decision: PermissionDecision) => {
            signal?.removeEventListener("abort", abort)
            resolve(decision)
          }
          const abort = () => {
            pending.delete(key)
            finish("denied")
            deliver(input.botId, { type: "permission-resolved", requestId: request.id })
          }

          if (signal?.aborted) {
            finish("denied")
            return
          }

          if (pending.has(key)) {
            throw new Error("Permission request already exists")
          }

          pending.set(key, { botId: input.botId, request, resolve: finish })
          signal?.addEventListener("abort", abort, { once: true })
          deliver(input.botId, { type: "permission-requested", request })
        }),
      }
      const session = await observability.span({ name: "pi.sessionopen", context: { botId: input.botId, provider: input.provider } }, () => sessionFactory.open({ ...input, policy }))
      const listeners = new Set<(event: PiRuntimeEvent) => void>()
      let receivedFirstEvent = false
      const unsubscribe = session.subscribe((event) => {
        if (!receivedFirstEvent) {
          receivedFirstEvent = true
          observability.event({ name: "pi.firstevent", context: { botId: input.botId, provider: input.provider } })
        }

        const annotated = annotate(input.botId, policy, event)

        for (const listener of listeners) {
          listener(annotated)
        }
      })
      sessions.set(input.botId, { session, provider: input.provider, policy, unsubscribe, listeners })

      return { sessionFile: session.sessionFile }
    },
    subscribe(botId: string, listener: (event: PiRuntimeEvent) => void) {
      const entry = existing(botId)

      entry.listeners.add(listener)

      return () => entry.listeners.delete(listener)
    },
    async authorize(botId: string, tool: string, action: unknown, signal: AbortSignal) {
      const entry = existing(botId)
      const result = await authorizeToolCall(entry.policy, tool, action, crypto.randomUUID(), signal)
      signal.throwIfAborted()

      return result
    },
    async prompt(botId: string, prompt: PiPrompt) {
      const entry = existing(botId)

      return observability.span({ name: "pi.turn", context: { botId, provider: entry.provider } }, () => entry.session.prompt(prompt))
    },
    async steer(botId: string, input: Pick<PiPrompt, "content" | "images">) {
      const entry = existing(botId)

      return observability.span({ name: "pi.steer", context: { botId, provider: entry.provider } }, () => entry.session.steer(input))
    },
    async compact(botId: string, customInstructions?: string) {
      const entry = existing(botId)

      return observability.span({ name: "pi.compact", context: { botId, provider: entry.provider } }, () => entry.session.compact(customInstructions))
    },
    addTools(botId: string, tools: PiTool[]) {
      const entry = existing(botId)

      if (!entry.session.addTools) {
        throw new Error("Pi session cannot add tools")
      }

      entry.policy.labels = { ...entry.policy.labels, ...toolLabels(tools) }
      entry.session.addTools(tools)
    },
    setPermissionMode(botId: string, mode: BotPermissionMode) {
      const entry = sessions.get(botId)

      if (!entry) {
        return
      }

      entry.policy.mode = mode

      if (mode === "ask") {
        return
      }

      for (const [key, request] of pending) {
        if (request.botId !== botId) {
          continue
        }

        pending.delete(key)

        if (mode === "read-only") {
          denied.add(key)
        }

        request.resolve(mode === "full" ? "allowed" : "denied")
        deliver(botId, { type: "permission-resolved", requestId: request.request.id })
      }
    },
    async abort(botId: string) {
      const entry = existing(botId)

      denyPending(botId)

      return observability.span({ name: "pi.abort", context: { botId, provider: entry.provider } }, () => entry.session.abort())
    },
    resolvePermission({ botId, requestId, decision }: { botId: string; requestId: string; decision: PermissionDecision }) {
      const key = pendingKey(botId, requestId)
      const request = pending.get(key)

      if (!request || request.botId !== botId) {
        throw new Error("Permission request not found")
      }

      pending.delete(key)

      if (decision === "denied") {
        denied.add(key)
      }

      request.resolve(decision)
      deliver(botId, { type: "permission-resolved", requestId })
    },
    pending(botId: string) {
      return Array.from(pending.values()).filter((request) => request.botId === botId).map((request) => request.request)
    },
    close,
    dispose() {
      for (const botId of sessions.keys()) {
        close(botId)
      }
    },
  }
}
