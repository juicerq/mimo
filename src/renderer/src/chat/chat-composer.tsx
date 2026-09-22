import { ArrowUpIcon, PaperClipIcon, SparklesIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent, useId, useRef, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { MessageImage } from "@src/shared/conversations"
import type { Skill } from "@src/shared/skills"
import type { EngineClient } from "../engine-client"
import { connectionStore } from "../connection"
import { Button } from "../ui/button"
import { ConfirmationDialog } from "../ui/dialog"
import { IconButton } from "../ui/icon-button"
import { menuCardClassName } from "../ui/menu"
import { useIsMobile } from "../ui/use-is-mobile"
import { ChatCommandMenu, type ChatMenuChoice } from "./chat-command-menu"
import { type ChatCommand, type ChatCommandSuggestion, useChatCommands } from "./chat-commands"
import { chatCommandDefinitions, chatSlash, commandAllowedWhileWorking, commandConsumesContent, withoutChatSlash, type ChatCommandName } from "./chat-command-definitions"
import { ChatImage, messageImageAccept, readMessageImages } from "./chat-images"
import { ChatEditor } from "./chat-editor"
import { applyChatMention, type ChatMentionSuggestion, mentionCandidates, suggestChatMentions } from "./chat-mentions"
import { ChatMobileOptions } from "./chat-mobile-options"
import { ChatModelEffort } from "./chat-model-effort"
import { ChatPermission } from "./chat-permission"
import { applyChatSkill, suggestChatSkills } from "./chat-skills"
import { addChatDraftImages, addChatDraftMention, type ChatDraft, type ChatRun, chatStore, clearChatDraftCommand, emptyChatDraft, removeChatDraftImage, setChatDraftCommand, setChatDraftContent } from "./chat-store"

export const promptWidthClassName = "mx-auto w-[min(848px,calc(100%-48px))] max-md:w-[calc(100%-24px)]"

interface ChatComposerProps {
  bot: Bot
  client: EngineClient
  onAbort: () => void
  onSend: (draft: ChatDraft, deliver: "queue" | "now") => void
}

function menuChoices(commands: ChatCommandSuggestion[], mentions: ChatMentionSuggestion[], skills: Skill[]): ChatMenuChoice[] {
  if (commands.length > 0 || skills.length > 0) {
    return [
      ...commands.map((suggestion) => ({ key: suggestion.command, label: `/${suggestion.command}`, detail: suggestion.detail })),
      ...skills.map((skill) => ({ key: `skill:${skill.name}`, label: skill.name, detail: skill.description, icon: <SparklesIcon className="size-4 shrink-0" aria-hidden="true" /> })),
    ]
  }

  return mentions.map((mention) => ({ key: mention.botId, label: mention.name, detail: mention.detail, avatar: mention.avatarSeed }))
}

function composerSlash(draft: ChatDraft, position: number) {
  if (draft.command) {
    return null
  }

  return chatSlash(draft.content, position)
}

function caretPosition(caret: number | null, content: string) {
  if (caret === null) {
    return content.length
  }

  return Math.min(caret, content.length)
}

function composerMenuState({ draft, position, availableSkills, groups, bot, run, dismissedContent, slash, suggestions }: {
  draft: ChatDraft
  position: number
  availableSkills: Skill[]
  groups: Parameters<typeof mentionCandidates>[0]
  bot: Bot
  run?: ChatRun
  dismissedContent: string | null
  slash: ReturnType<typeof chatSlash>
  suggestions: ChatCommandSuggestion[]
}) {
  const skills = slash ? suggestChatSkills(draft.content, availableSkills, position) : []
  const mentions = draft.command || slash ? [] : suggestChatMentions(draft.content, mentionCandidates(groups, bot))
  const commands = run ? suggestions.filter((suggestion) => commandAllowedWhileWorking(suggestion.command)) : suggestions
  const choices = menuChoices(commands, mentions, skills)

  return { skills, mentions, commands, choices, menuOpen: (choices.length > 0 || !!slash) && draft.content !== dismissedContent }
}

function ChatComposerActions({ command, run, pending, blocked, empty, onAbort, onSend }: { command: ChatCommand | null; run?: Pick<ChatRun, "status" | "waitingForTasks">; pending: boolean; blocked: boolean; empty: boolean; onAbort: () => void; onSend: (immediate: boolean) => Promise<void> }) {
  const mobile = useIsMobile()
  const connected = useSelector(connectionStore, (state) => state.connected)
  const working = !!run
  const aborting = run?.status === "aborting"

  return (
    <div className="col-start-5 flex items-center gap-2">
      {mobile && working && !empty && !blocked && <IconButton iconSize={14} shape="circle" size={34} tone="danger" type="button" disabled={aborting || !connected} label="Interromper resposta" onClick={onAbort}><StopIcon /></IconButton>}
      {working && (empty || blocked)
        ? <IconButton iconSize={14} shape="circle" size={34} tone="danger" type="button" disabled={aborting || !connected} label={abortLabel({ run, blocked })} tooltipPlacement="top" onClick={onAbort}><StopIcon aria-hidden="true" /></IconButton>
        : <IconButton className="active:scale-96 [&>svg]:stroke-2" shape="circle" size={34} tone="primary" type="button" disabled={empty || pending || blocked || !connected} label={connected ? sendLabel({ command, pending, run, blocked }) : "Aguardando conexão para enviar"} tooltipPlacement="top" onClick={(event) => void onSend(event.ctrlKey || event.metaKey)}><ArrowUpIcon aria-hidden="true" /></IconButton>}
    </div>
  )
}

export function ChatComposer({ bot, client, onAbort, onSend }: ChatComposerProps) {
  const connected = useSelector(connectionStore, (state) => state.connected)
  const draftSaved = useSelector(chatStore, (state) => state.draftSaved)
  const [confirmStop, setConfirmStop] = useState(false)
  const draft = useSelector(chatStore, (state) => state.drafts[bot.id] ?? emptyChatDraft)
  const run = useSelector(chatStore, (state) => state.runs[bot.id])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const menuId = `commands-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const [highlighted, setHighlighted] = useState(0)
  const [dismissedContent, setDismissedContent] = useState<string | null>(null)
  const [caret, setCaret] = useState<number | null>(null)
  const position = caretPosition(caret, draft.content)
  const mobile = useIsMobile()
  const { suggestions, command, start: startCommand, run: runCommand, reset: resetCommand, pending: commandPending, error: commandError, status: commandStatus } = useChatCommands(bot, client, draft, position)
  const { data: groups } = useQuery(client.query.projects.list.queryOptions())
  const slash = composerSlash(draft, position)
  const skillSearch = !!slash
  const { data: availableSkills = [], isPending: skillsPending, error: skillsError } = useQuery(client.query.bots.skills.queryOptions({ input: { botId: bot.id }, enabled: skillSearch && connected, throwOnError: false }))
  const { skills, mentions, commands, choices, menuOpen } = composerMenuState({ draft, position, availableSkills, groups, bot, run, dismissedContent, slash, suggestions })
  const active = Math.min(highlighted, choices.length - 1)
  const empty = composerEmpty(command, draft)
  const commandBlocked = !!command && !commandAllowedWhileWorking(command.command) && !!run
  const busy = commandPending
  const permissionDisabled = busy || !connected
  const settingsDisabled = [!!run, commandPending, !connected].some(Boolean)
  const editor = editorText(draft, bot.name)

  async function attachFiles(files: Iterable<File>) {
    const images = await readMessageImages(files)

    if (images.length === 0) {
      return
    }

    addChatDraftImages(bot.id, images)
  }

  async function handleSend(immediate: boolean) {
    if (empty || busy || commandBlocked || !connected) {
      return
    }

    if (command) {
      const ran = await runCommand(command).then(() => true).catch(() => false)

      if (ran) {
        const current = chatStore.state.drafts[bot.id] ?? emptyChatDraft

        if (current.command === draft.command) {
          const content = current === draft && commandConsumesContent(command.command) ? "" : current.content
          const remaining = current === draft && !draft.command && slash ? withoutChatSlash(content, slash) : content

          clearChatDraftCommand(bot.id, remaining)
          setCaret(null)
        }
      }

      return
    }

    onSend(draft, immediate ? "now" : "queue")
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSend(false)
  }

  function handleChange(content: string, caretOffset = content.length) {
    resetCommand()
    setHighlighted(0)
    setDismissedContent(null)
    setCaret(caretOffset)

    const started = startCommand(content, caretOffset)

    if (started) {
      setChatDraftCommand(bot.id, started.command, started.content)
      setCaret(null)

      return
    }

    setChatDraftContent(bot.id, content)
  }

  function pickChoice(index: number) {
    const suggestion = commands[index]

    if (suggestion) {
      setChatDraftCommand(bot.id, suggestion.command, slash ? withoutChatSlash(draft.content, slash) : draft.content)
      setCaret(null)

      return
    }

    const skill = skills[index - commands.length]

    if (skill) {
      const selection = applyChatSkill(draft.content, skill.name, position)

      setChatDraftContent(bot.id, selection.content)
      setCaret(selection.caret)
      setDismissedContent(null)

      return
    }

    const mention = mentions[index]

    if (mention) {
      addChatDraftMention(bot.id, applyChatMention(draft.content, mention), { botId: mention.botId, name: mention.name, avatarSeed: mention.avatarSeed })
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      setDismissedContent(draft.content)

      return
    }

    if (choices.length === 0) {
      if (["ArrowDown", "ArrowUp", "Tab", "Enter"].includes(event.key)) {
        event.preventDefault()
      }

      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlighted((active + 1) % choices.length)

      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlighted((active - 1 + choices.length) % choices.length)

      return
    }

    if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
      event.preventDefault()
      pickChoice(active)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, atStart: boolean) {
    if (event.nativeEvent.isComposing) {
      return
    }

    if (menuOpen) {
      handleMenuKeyDown(event)

      return
    }

    if (draft.command && event.key === "Backspace" && atStart) {
      event.preventDefault()
      clearChatDraftCommand(bot.id, draft.content)

      return
    }

    if (event.key === "Escape" && run) {
      event.preventDefault()
      onAbort()

      return
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return
    }

    event.preventDefault()
    void handleSend(event.ctrlKey || event.metaKey)
  }

  function handleDragOver(event: DragEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault()

    void attachFiles(event.dataTransfer.files)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void attachFiles(event.target.files ?? [])
    event.target.value = ""
  }

  function handleAbort() {
    if (mobile) {
      setConfirmStop(true)

      return
    }

    onAbort()
  }

  return (
    <form
      className={`${promptWidthClassName} relative grid box-border grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 border border-outline-strong bg-surface-raised px-2 py-[7px] shadow-[0_14px_32px_rgb(0_0_0_/_24%)] gap-y-1 rounded-[18px] focus-within:border-muted`}
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {menuOpen && <ChatCommandMenu id={menuId} label={skillSearch ? "Comandos e skills" : "Bots"} choices={choices} highlighted={active} onHighlight={setHighlighted} onPick={pickChoice} status={skillMenuStatus({ searching: skillSearch, pending: skillsPending, error: skillsError, count: skills.length })} />}
      <ChatCommandStatus error={commandError} status={commandStatus} menuOpen={menuOpen} />
      {draft.images.length > 0 && <ChatComposerImages images={draft.images} onRemove={(index) => removeChatDraftImage(bot.id, index)} />}
      <IconButton iconSize={16} shape="circle" size={34} type="button" label="Anexar imagem" tooltipPlacement="top" onClick={() => fileInputRef.current?.click()}><PaperClipIcon aria-hidden="true" /></IconButton>
      <input ref={fileInputRef} className="hidden" type="file" accept={messageImageAccept} multiple tabIndex={-1} onChange={handleFileChange} />
      <div className="order-first col-span-full flex min-w-0 items-start gap-1.5">
        {draft.command && <ChatComposerCommand command={draft.command} onRemove={() => clearChatDraftCommand(bot.id, draft.content)} />}
        <ChatEditor
          id={`prompt-${bot.id}`}
          content={draft.content}
          caret={position}
          mentions={draft.mentions}
          placeholder={editor.placeholder}
          label={editor.label}
          menuOpen={menuOpen}
          menuId={menuId}
          activeOptionId={menuOpen && active >= 0 ? `${menuId}-${active}` : undefined}
          enterBreaksLine={mobile}
          onChange={handleChange}
          onCaretChange={setCaret}
          onKeyDown={handleKeyDown}
          onPasteFiles={(files) => void attachFiles(files)}
        />
      </div>
      {mobile ? <ChatMobileOptions bot={bot} client={client} disabled={settingsDisabled} permissionDisabled={permissionDisabled} /> : <>
        <ChatPermission bot={bot} client={client} disabled={permissionDisabled} />
        <div className="col-start-4 flex min-w-0"><ChatModelEffort bot={bot} client={client} disabled={settingsDisabled} /></div>
      </>}
      <ChatComposerActions command={command} run={run} pending={commandPending} blocked={commandBlocked} empty={empty} onAbort={handleAbort} onSend={handleSend} />
      {!draftSaved && <p className="col-span-full m-0 px-2 text-support text-status-warning" role="status">Sem espaço para salvar o rascunho neste celular. Mantenha esta tela aberta até enviar.</p>}
      {confirmStop && <ConfirmationDialog icon={<StopIcon />} title={`Interromper ${bot.name}?`} onClose={() => setConfirmStop(false)} actions={<><Button type="button" variant="text" onClick={() => setConfirmStop(false)}>Continuar trabalhando</Button><Button type="button" disabled={!connected} onClick={() => { setConfirmStop(false); onAbort() }}>Interromper</Button></>}><p className="m-0 text-body text-secondary">As mensagens e a Fila serão preservadas.</p></ConfirmationDialog>}
    </form>
  )
}

function composerEmpty(command: ChatCommand | null, draft: ChatDraft) {
  if (draft.command) {
    return !command
  }

  return draft.content.trim().length === 0 && draft.images.length === 0
}

function skillMenuStatus({ searching, pending, error, count }: { searching: boolean; pending: boolean; error: Error | null; count: number }) {
  if (!searching) {
    return
  }

  if (error) {
    return "Não foi possível carregar as skills. Feche e abra o menu para tentar novamente."
  }

  if (pending) {
    return "Carregando skills..."
  }

  if (count === 0) {
    return "Nenhuma skill encontrada."
  }
}

function editorText(draft: Pick<ChatDraft, "command">, botName: string) {
  if (draft.command) {
    return { placeholder: chatCommandDefinitions[draft.command].placeholder, label: `Texto do Comando ${draft.command}` }
  }

  return { placeholder: `Converse com ${botName}...`, label: `Mensagem para ${botName}` }
}

function abortLabel({ run, blocked }: { run?: Pick<ChatRun, "status">; blocked: boolean }) {
  if (run?.status === "aborting") {
    return "Interrompendo resposta"
  }

  if (blocked) {
    return "Interromper resposta · remova o Comando para enfileirar"
  }

  return "Interromper resposta"
}

function sendLabel({ command, pending, run, blocked }: { command: ChatCommand | null; pending: boolean; run?: Pick<ChatRun, "waitingForTasks">; blocked: boolean }) {
  if (pending) {
    return "Executando Comando"
  }

  if (blocked) {
    return "Remova o Comando para falar enquanto o Bot trabalha"
  }

  if (command) {
    return `Executar o Comando ${command.command}`
  }

  if (run && !run.waitingForTasks) {
    return "Enfileirar mensagem · Ctrl+Enter adianta · Esc interrompe"
  }

  return "Enviar mensagem"
}

function ChatComposerCommand({ command, onRemove }: { command: ChatCommandName; onRemove: () => void }) {
  return (
    <button
      className="flex h-[25px] shrink-0 items-center gap-1 rounded-md border border-outline-strong bg-surface-hover px-2 text-metadata font-medium text-secondary transition-colors duration-150 hover:bg-surface-active hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none [&>svg]:size-3 [&>svg]:stroke-2"
      type="button"
      aria-label={`Remover o Comando ${command}`}
      onClick={onRemove}
    >
      <span>/{command}</span>
      <XMarkIcon aria-hidden="true" />
    </button>
  )
}

function ChatCommandStatus({ error, status, menuOpen }: { error: Error | null; status: string | null; menuOpen: boolean }) {
  if (status) {
    return <p className="col-span-full m-0 px-2 text-support text-secondary" role="status">{status}</p>
  }

  if (!error || menuOpen) {
    return null
  }

  return <div className={`${menuCardClassName} absolute bottom-full left-0 mb-2 max-w-full px-3 py-2 text-support text-status-error`} role="alert" aria-live="polite">Falha ao executar o Comando: {error.message}</div>
}

function ChatComposerImages({ images, onRemove }: { images: MessageImage[]; onRemove: (index: number) => void }) {
  return (
    <ul className="order-first col-span-full m-0 flex list-none flex-wrap gap-2 p-1 max-md:max-h-[min(80px,12dvh)] max-md:overflow-y-auto">
      {images.map((image, index) => (
        <li key={`${index}-${image.data.length}`} className="group relative max-md:flex max-md:items-center max-md:gap-1">
          <ChatImage className="block size-12 rounded-lg border border-outline-strong object-cover" image={image} index={index} />
          <IconButton className="-top-1.5 -right-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:static max-md:bg-transparent max-md:opacity-100" iconSize={13} position="absolute" shape="circle" size={24} tone="canvas" type="button" label="Remover imagem" tooltipPlacement="top" onClick={() => onRemove(index)}><XMarkIcon aria-hidden="true" /></IconButton>
        </li>
      ))}
    </ul>
  )
}
