import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { EngineClient } from "../engine-client"
import type { ChatDraft } from "./chat-store"
import { chatCommandDefinitions, chatCommandName, chatSlash, withoutChatSlash, type ChatCommandName } from "./chat-command-definitions"

export interface ChatCommandSuggestion { command: ChatCommandName; detail: string }
export interface ChatCommand { command: ChatCommandName; content: string }

function availableChatCommands(memoryEnabled: boolean): ChatCommandSuggestion[] {
  return (Object.keys(chatCommandDefinitions) as ChatCommandName[])
    .filter((command) => command !== "memory" || memoryEnabled)
    .map((command) => ({ command, detail: chatCommandDefinitions[command].detail }))
}

export function useChatCommands(bot: Bot, client: EngineClient, draft: ChatDraft, caret: number) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string | null>(null)
  const { mutateAsync, isPending, error, reset } = useMutation({
    async mutationFn(target: ChatCommand) {
      setStatus(null)

      if (target.command === "new") {
        await client.raw.conversations.newSession({ botId: bot.id })
        await Promise.all([
          queryClient.resetQueries({ queryKey: client.query.conversations.history.key({ input: { botId: bot.id } }) }),
          queryClient.invalidateQueries({ queryKey: client.query.conversations.overview.key() }),
        ])
        setStatus("Sessão nova pronta. As mensagens anteriores estão ocultas neste chat.")

        return
      }

      if (target.command === "memory") {
        await client.raw.memory.add({ botId: bot.id, content: target.content })
        await queryClient.invalidateQueries({ queryKey: client.query.memory.list.queryOptions({ input: { botId: bot.id } }).queryKey })
        setStatus("Lembrança salva na Memória do Bot.")

        return
      }

      if (target.command === "compact") {
        await client.raw.conversations.compact({ botId: bot.id, ...(target.content ? { instructions: target.content } : {}) })
        setStatus("Contexto compactado. O histórico continua salvo.")

        return
      }

      if (target.command === "reload") {
        await client.raw.conversations.reload({ botId: bot.id })
        await queryClient.invalidateQueries({ queryKey: client.query.bots.skills.queryOptions({ input: { botId: bot.id } }).queryKey })
        setStatus("Skills e instruções recarregadas. A sessão foi preservada.")

        return
      }
    },
  })
  const available = availableChatCommands(bot.memoryEnabled)
  const slash = draft.command ? null : chatSlash(draft.content, caret)
  const suggestions = slash ? available.filter(({ command }) => [command, ...chatCommandDefinitions[command].aliases].some((name) => name.startsWith(slash.word.toLowerCase()))) : []
  const typedCommand = slash ? chatCommandName(slash.word) : undefined
  const selected = draft.command ?? typedCommand
  const content = !draft.command && slash ? withoutChatSlash(draft.content, slash).trim() : draft.content.trim()
  const command = selected && available.some((item) => item.command === selected) && (selected !== "memory" || content)
    ? { command: selected, content }
    : null

  function start(content: string, position: number) {
    if (draft.command || !/\s$/.test(content.slice(0, position))) {
      return null
    }

    const slash = chatSlash(content, position - 1)
    const name = slash ? chatCommandName(slash.word) : undefined

    if (!slash || !name || !available.some((item) => item.command === name)) {
      return null
    }

    return { command: name, content: `${content.slice(0, slash.start)}${content.slice(position)}` }
  }

  return {
    suggestions,
    command,
    start,
    run: mutateAsync,
    reset: () => {
      if (!isPending) {
        reset()
        setStatus(null)
      }
    },
    pending: isPending,
    error,
    status,
  }
}
