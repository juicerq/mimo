import type { QueryClient } from "@tanstack/react-query"
import type { BotConversationEvent, FinishReason } from "@src/shared/conversations"
import { findTeamBot } from "../bots/team"
import type { EngineClient } from "../engine-client"
import { connectionStore } from "../connection"
import { listenEngineStream } from "../engine-stream"
import { createChatStreamBuffer } from "./chat-stream-buffer"
import {
  appendChatThinking,
  finishChatMessage,
  finishChatThinking,
  finishChatTool,
  requestChatPermission,
  requestChatPlugin,
  resolveChatPermission,
  resetChatConnection,
  resolveChatPlugin,
  setChatCompacting,
  setChatProviderWait,
  setChatPluginStep,
  setChatQueue,
  setChatDelegationWaiting,
  settleChatRun,
  startChatRun,
  startChatThinking,
  startChatTool,
} from "./chat-store"
import { alertTurnFinished } from "./turn-alert"

const chunkFlushDelayMs = 100
const settledStatuses: Record<FinishReason, "available" | "completed" | "error"> = { stop: "completed", aborted: "available", error: "error" }

export function subscribeChatEvents({ client, queryClient }: { client: Pick<EngineClient, "query" | "raw">; queryClient: QueryClient }) {
  const chunks = createChatStreamBuffer({
    delayMs: chunkFlushDelayMs,
    flush: appendChatThinking,
  })

  function handle({ botId, event }: BotConversationEvent) {
    if (event.type === "thinking") {
      chunks.push(botId, event.text)
      return
    }

    chunks.drain(botId)

    if (event.type === "finished") {
      finishTurn(botId, event)
      return
    }

    if (event.type === "tool-finished" && event.tool === "configure_member") {
      void invalidateTeam().catch(() => {})
    }

    if (event.type === "provider-waiting" || event.type === "provider-resumed") {
      setChatProviderWait(botId, event)
      return
    }

    if (event.type === "delegation-waiting") {
      setChatDelegationWaiting(botId, event.waiting)
      return
    }

    applyChatEvent(botId, event)
  }

  function applyChatEvent(botId: string, event: Exclude<BotConversationEvent["event"], { type: "thinking" | "finished" }>) {
    if (event.type === "started") {
      startChatRun(botId, event.message, event.messageId)
      void invalidateTeam().catch(() => {})
      return
    }

    if (event.type === "message-finished") {
      finishChatMessage(botId, event.message)
      void queryClient.invalidateQueries({ queryKey: client.query.conversations.overview.key() }).catch(() => {})
      return
    }

    if (event.type === "thinking-started") {
      startChatThinking(botId)
      return
    }

    if (event.type === "thinking-finished") {
      finishChatThinking(botId, event.durationMs)
      return
    }

    if (event.type === "tool-started") {
      startChatTool(botId, event)
      return
    }

    if (event.type === "tool-finished") {
      finishChatTool(botId, event)

      return
    }

    if (event.type === "compaction-started" || event.type === "compaction-finished") {
      setChatCompacting(botId, event.type === "compaction-started")
      return
    }

    if (event.type === "permission-requested") {
      requestChatPermission(botId, event.request)
      return
    }

    if (event.type === "permission-resolved") {
      resolveChatPermission(botId, event.requestId)
      return
    }

    if (event.type === "plugin-requested") {
      requestChatPlugin(botId, event.request)
      return
    }

    if (event.type === "plugin-step") {
      applyPluginStep(botId, event)
      return
    }

    if (event.type === "plugin-resolved") {
      resolveChatPlugin(botId, event.requestId)
      void queryClient.invalidateQueries({ queryKey: client.query.plugins.key() }).catch(() => {})
      return
    }

    if (event.type === "queue-changed") {
      setChatQueue(botId, event.queued)
      return
    }
  }

  function applyPluginStep(botId: string, event: Extract<BotConversationEvent["event"], { type: "plugin-step" }>) {
    setChatPluginStep(botId, event.requestId, event.step)

    if (event.step.type === "browser") {
      void window.desktop.openInBrowser(event.step.url).catch(() => {})
    }
  }

  function finishTurn(botId: string, event: Extract<BotConversationEvent["event"], { type: "finished" }>) {
    const projectsQuery = client.query.projects.list.queryOptions()
    const bot = findTeamBot(queryClient.getQueryData(projectsQuery.queryKey), botId)
    const response = settleChatRun(botId, event.silent ? undefined : settledStatuses[event.reason])

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: client.query.conversations.history.key({ input: { botId } }) }),
      queryClient.invalidateQueries({ queryKey: client.query.tasks.key() }),
      queryClient.invalidateQueries({ queryKey: client.query.routines.list.key({ input: { botId } }) }),
      queryClient.invalidateQueries({ queryKey: client.query.conversations.overview.key() }),
      invalidateTeam(),
      alertTurnFinished({ bot, reason: event.reason, response, ...(event.silent ? { silent: true } : {}), ...(event.error ? { error: event.error } : {}) }).catch((alertError: unknown) => {
        console.error("O aviso do turno falhou", alertError)
      }),
    ]).catch((error: unknown) => {
      console.error("Não foi possível atualizar o resultado do turno", error)
    })
  }

  async function invalidateTeam() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: client.query.projects.key() }),
      queryClient.invalidateQueries({ queryKey: client.query.conversations.teamWorking.key() }),
    ])
  }

  const stop = listenEngineStream({
    label: "as conversas",
    open: (signal) => client.raw.conversations.events(undefined, { signal }),
    probe: (signal) => client.raw.health(undefined, { signal }),
    connected() {
      connectionStore.setState(() => ({ connected: true }))
      resetChatConnection()
      void queryClient.invalidateQueries().catch((error: unknown) => {
        console.error("Não foi possível atualizar o estado das conversas", error)
      })
    },
    handle,
    closed() {
      connectionStore.setState(() => ({ connected: false }))
      chunks.drainAll()
    },
  })

  return () => {
    stop()
    chunks.drainAll()
  }
}
