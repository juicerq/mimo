import { splitSkillInvocations } from "@src/shared/skill-invocations"
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { useCallback, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { ConversationMessage, IncomingMessage, MessageImage, MessageReply } from "@src/shared/conversations"
import type { Task } from "@src/shared/tasks"
import { BotFace } from "../bots/bot-face"
import { Button } from "../ui/button"
import { focusBrowser } from "../browser/browser-store"
import type { EngineClient } from "../engine-client"
import { appSettingsStore } from "../settings/app-settings-store"
import { type TeamIdentities, teamIdentities, teamOf } from "../bots/team"
import {
  type ChatDraft,
  chatStore,
  emptyChatDraft,
  failChatRun,
  markChatAborting,
  setChatDraft,
  settleChatRun,
  startChatRun,
  type ChatRun as ChatRunState,
} from "./chat-store"
import { ChatComposer } from "./chat-composer"
import { ChatQueue } from "./chat-queue"
import { ChatImage } from "./chat-images"
import { chatReadingPosition } from "./chat-reading-position"
import { ChatScroller } from "./chat-scroller"
import { ChatStamped } from "./chat-stamp"
import { ChatActivity, hasActivityDetails } from "./chat-activity"
import { ChatCallNotice } from "./chat-call-notice"
import { ChatFileDirectory, ChatFileText } from "./chat-file"
import { ChatContent } from "./chat-content"
import { flattenHistory, historyPageInput, initialMessageLimit, olderHistoryPage, revealStep, windowHistory } from "./chat-history-window"
import { ChatMemberResult, memberResultKind } from "./chat-member-result"
import { ChatSkillChip } from "./chat-skills"
import { ChatMentionChip } from "./chat-mention-chip"
import { type ChatMention, knownChatMentions, mentionedBotIds, splitChatMentions } from "./chat-mentions"
import { ChatPermissionRequest } from "./chat-permission-request"
import { ChatPluginRequest } from "./chat-plugin-request"
import { ChatQuestion, type QuestionAnswer } from "./chat-question"
import { finishConversationOpen } from "./chat-open-span"
import { chatGreeting } from "./chat-greetings"
import { ChatProviderWaiting, ChatRecoveryActions } from "./chat-recovery"
import { ChatTurnEnding } from "./chat-turn-ending"
import { connectionStore } from "../connection"
import { useIsMobile } from "../ui/use-is-mobile"
import { ChatTeamUpdates } from "./chat-team-updates"
import { ChatTeamControl } from "./chat-team-control"

interface ChatTeam { bots: TeamIdentities; tasks: Record<string, Task> }

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" })
const pulsingDotDelays = ["", "[animation-delay:150ms]", "[animation-delay:300ms]"]

export function ChatWorkspace({ bot, client }: { bot: Bot; client: EngineClient }) {
  const mobile = useIsMobile()
  const [shown, setShown] = useState(() => chatReadingPosition.shown(bot.id, initialMessageLimit))
  const activityDetailsVisible = useSelector(appSettingsStore, (state) => state.activityDetailsVisible)
  const { data: pages, error, isPending, isFetchedAfterMount, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(client.query.conversations.history.infiniteOptions({
    input: (before: string | undefined) => historyPageInput(bot.id, before),
    initialPageParam: undefined,
    getNextPageParam: olderHistoryPage,
  }))
  const history = pages ? flattenHistory(pages.pages) : undefined
  const messages = history?.messages
  const earlier = history?.earlier ?? 0
  const { data: groups } = useQuery(client.query.projects.list.queryOptions())
  const { data: tasks } = useQuery(client.query.tasks.listForBot.queryOptions({ input: { botId: bot.id } }))
  const { members } = teamOf(groups, bot)
  const team: ChatTeam = { bots: teamIdentities(groups), tasks: Object.fromEntries((tasks ?? []).map((task) => [task.id, task])) }
  const { mutateAsync: abort } = useMutation(client.query.conversations.abort.mutationOptions())
  const { visible, hidden } = windowHistory(messages ?? [], shown)
  const historyIds = new Set(messages?.map((message) => message.id))
  const answersByQuestionId = questionAnswers(messages)
  const handleOpened = useCallback((section: HTMLElement | null) => {
    if (section && messages) {
      finishConversationOpen(client.raw.observations, { botId: bot.id, count: messages.length, state: isFetchedAfterMount ? "fetched" : "cached" })
    }
  }, [bot.id, client, isFetchedAfterMount, messages])

  async function sendPersonInput(message: { content: string; images: MessageImage[]; replyTo: MessageReply | null }, mentions: ChatDraft["mentions"]) {
    if (!connectionStore.state.connected) {
      return false
    }

    startChatRun(bot.id, { author: "person", authorBotId: null, taskId: null, triggerRunId: null, ...message }, "")

    return client.raw.conversations.send({ botId: bot.id, ...message, mentionedBotIds: mentionedBotIds(message.content, mentions) }).then(() => true).catch((sendError: unknown) => {
      failChatRun(bot.id, sendError instanceof Error ? sendError.message : "Não foi possível responder")

      return false
    })
  }

  async function handleSend(draft: ChatDraft, deliver: "queue" | "now") {
    if (!connectionStore.state.connected) {
      return
    }

    const message = { content: draft.content.trim(), images: draft.images, replyTo: null }

    setChatDraft(bot.id, emptyChatDraft)

    if (!chatStore.state.runs[bot.id]) {
      const sent = await sendPersonInput(message, draft.mentions)

      if (!sent) {
        setChatDraft(bot.id, draft)
      }

      return
    }

    await client.raw.conversations.send({ botId: bot.id, ...message, mentionedBotIds: mentionedBotIds(message.content, draft.mentions), deliver })
      .catch((sendError: unknown) => {
        setChatDraft(bot.id, draft)
        console.error("A mensagem voltou para o campo: o Engine não a aceitou", sendError)
      })
  }

  async function handleRetry() {
    return sendPersonInput({ content: "Continue de onde parou antes da falha do provedor. Confira o histórico e os resultados já obtidos; preserve o trabalho realizado e não repita ações concluídas.", images: [], replyTo: null }, [])
  }

  async function handleQuestionAnswer(messageId: string, optionValues: string[]) {
    return sendPersonInput({ content: "", images: [], replyTo: { messageId, optionValues } }, [])
  }

  async function revealEarlier() {
    if (hidden === 0 && hasNextPage) {
      await fetchNextPage()
    }

    setShown(chatReadingPosition.reveal(bot.id, revealStep, initialMessageLimit))
  }

  async function handleAbort() {
    const run = chatStore.state.runs[bot.id]

    if (!run || run.status === "aborting") {
      return
    }

    markChatAborting(bot.id)
    await abort({ botId: bot.id }).catch((abortError: unknown) => {
      failChatRun(bot.id, abortError instanceof Error ? abortError.message : "Não foi possível interromper")
    })
  }

  return (
    <ChatFileDirectory value={bot.effectiveWorkingDirectory}>
      <section ref={handleOpened} className="relative grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-surface before:pointer-events-none before:absolute before:top-0 before:right-2 before:left-px before:z-[1] before:h-3 before:rounded-tl-[23px] before:bg-[color-mix(in_srgb,var(--color-surface)_36%,transparent)] before:backdrop-blur-[6px] before:[clip-path:inset(0_round_23px_0_0)] before:[mask-image:linear-gradient(to_bottom,#000,transparent)] max-md:before:hidden">
        <ChatScroller botId={bot.id} footer={<>
          <ChatTeamControl key={bot.id} bot={bot} members={members} client={client} />
          <ChatQueue bot={bot} client={client} />
          <ChatComposer bot={bot} client={client} onAbort={handleAbort} onSend={handleSend} />
        </>} {...(hidden + earlier > 0 ? { onRevealEarlier: revealEarlier } : {})}>
          {isPending && <ChatLoading />}
          {error && <ChatError message={error.message} />}
          {isFetchingNextPage && <ChatEarlierLoading />}
          {visible.map((message) => <ChatMessageRow key={message.id} activityDetailsVisible={activityDetailsVisible} answer={answersByQuestionId[message.id]} bot={bot} message={message} team={team} onQuestionAnswer={handleQuestionAnswer} />)}
          {mobile && <ChatTeamUpdates bot={bot} members={members} client={client} />}
          {messages && <ChatRunSlot activityDetailsVisible={activityDetailsVisible} bot={bot} client={client} team={team} historyIds={historyIds} messages={messages} onRetry={handleRetry} />}
        </ChatScroller>
      </section>
    </ChatFileDirectory>
  )
}

function questionAnswers(messages: ConversationMessage[] = []) {
  return Object.fromEntries(messages.flatMap((message) => message.replyTo ? [[message.replyTo.messageId, message.replyTo]] : []))
}

function ChatEarlierLoading() {
  return (
    <div className="flex justify-center py-2 [overflow-anchor:none]">
      <span className="size-3.5 animate-spin rounded-full border border-outline-strong border-t-primary [animation-duration:800ms] motion-reduce:animate-none" role="status" aria-label="Carregando mensagens anteriores" />
    </div>
  )
}

function ChatRunSlot({ activityDetailsVisible, bot, client, team, historyIds, messages, onRetry }: { activityDetailsVisible: boolean; bot: Bot; client: EngineClient; team: ChatTeam; historyIds: Set<string>; messages: ConversationMessage[]; onRetry: () => Promise<boolean> }) {
  const run = useSelector(chatStore, (state) => state.runs[bot.id])

  if (run) {
    return <ChatRun activityDetailsVisible={activityDetailsVisible} bot={bot} client={client} run={run} team={team} historyIds={historyIds} />
  }

  if (messages.at(-1)?.ending === "failed") {
    return <ChatRecoveryActions bot={bot} client={client} onRetry={onRetry} />
  }

  if (messages.length === 0) {
    return <EmptyChat bot={bot} />
  }

  return null
}

function ChatMessageRow({ activityDetailsVisible, answer, bot, message, team, onQuestionAnswer }: { activityDetailsVisible: boolean; answer?: MessageReply; bot: Bot; message: ConversationMessage; team: ChatTeam; onQuestionAnswer?: QuestionAnswer }) {
  if (!messageRenders(message, activityDetailsVisible, bot.id)) {
    return null
  }

  return (
    <div className="flex flex-col" data-message-id={message.id}>
      <ChatMessage activityDetailsVisible={activityDetailsVisible} bot={bot} message={message} team={team} {...(answer ? { answer } : {})} {...(onQuestionAnswer ? { onQuestionAnswer } : {})} />
    </div>
  )
}

/** A message only occupies the column when it renders something: a turn that delivers nothing leaves no gap. */
function messageRenders(message: ConversationMessage, activityDetailsVisible: boolean, botId: string) {
  if (message.author === "person") {
    return !message.replyTo
  }

  if (message.author === "routine" || message.author === "trigger") {
    return activityDetailsVisible
  }

  if (!isOwnMessage(message, botId)) {
    return true
  }

  return botMessageRenders(message, activityDetailsVisible)
}

function botMessageRenders(message: Pick<ConversationMessage, "content" | "question" | "ending" | "activity">, activityDetailsVisible: boolean) {
  return !!message.content || !!message.question || !!message.ending || (activityDetailsVisible && hasActivityDetails(message.activity))
}

function isOwnMessage(message: ConversationMessage, botId: string) {
  return message.author === "bot" && (message.authorBotId === null || message.authorBotId === botId)
}

function ChatMessage({ activityDetailsVisible, answer, bot, message, team, onQuestionAnswer }: { activityDetailsVisible: boolean; answer?: MessageReply; bot: Bot; message: ConversationMessage; team: ChatTeam; onQuestionAnswer?: QuestionAnswer }) {
  const time = formatMessageTime(message.createdAt)

  if (!isOwnMessage(message, bot.id)) {
    return <ChatTurnStart activityDetailsVisible={activityDetailsVisible} bot={bot} message={message} team={team} time={time} />
  }

  return <BotBubble activityDetailsVisible={activityDetailsVisible} bot={bot} message={message} time={time} {...(answer ? { answer } : {})} {...(onQuestionAnswer ? { onQuestionAnswer } : {})} />
}

function ChatTurnStart({ activityDetailsVisible, bot, message, team, time, open = false }: { activityDetailsVisible: boolean; bot: Bot; message: IncomingMessage; team: ChatTeam; time: string; open?: boolean }) {
  if (message.author === "person") {
    if (message.replyTo) {
      return null
    }

    return <PersonBubble time={time} content={message.content} images={message.images} mentions={knownChatMentions(team.bots)} />
  }

  if (message.author === "routine" || message.author === "trigger") {
    if (!activityDetailsVisible) {
      return null
    }

    return <ChatCallNotice kind={message.author} botName={bot.name} time={time} content={message.content} open={open} />
  }

  const task = message.taskId ? team.tasks[message.taskId] : undefined
  const author = message.authorBotId ? team.bots[message.authorBotId] : undefined

  return <ChatMemberResult kind={memberResultKind(bot.id, task)} name={author?.name ?? "Bot"} {...(message.authorBotId && author ? { bot: { id: message.authorBotId, name: author.name } } : {})} status={task?.status} time={time} content={message.content} open={open} />
}

function BotBubble({ activityDetailsVisible, answer, bot, message, time, onQuestionAnswer }: { activityDetailsVisible: boolean; answer?: MessageReply; bot: Bot; message: ConversationMessage; time: string; onQuestionAnswer?: QuestionAnswer }) {
  if (!botMessageRenders(message, activityDetailsVisible)) {
    return null
  }

  return (
    <article className="w-fit max-w-full self-start">
      {activityDetailsVisible && message.activity && <ChatActivity activity={message.activity} botName={bot.name} time={time} />}
      {(message.content || message.question) && (
        <ChatStamped className="chat-bot-bubble" copy={message.content} name={bot.name} time={time} anchor="bubble">
          {message.content && <ChatContent content={message.content} bot={bot} />}
          {message.question && <ChatQuestion botId={bot.id} messageId={message.id} question={message.question} answerValues={answer?.optionValues} {...(onQuestionAnswer ? { onAnswer: onQuestionAnswer } : {})} />}
        </ChatStamped>
      )}
      {message.ending && <ChatStamped name={bot.name} time={time} anchor="text"><ChatTurnEnding botName={bot.name} ending={message.ending} {...(message.error ? { error: message.error } : {})} /></ChatStamped>}
    </article>
  )
}

function PersonBubble({ time, content, images, mentions }: { time: string; content: string; images: MessageImage[]; mentions: ChatMention[] }) {
  return (
    <ChatStamped className="flex max-w-[min(640px,84%)] flex-col gap-2 self-end rounded-[16px_16px_4px_16px] bg-surface-active px-4 py-3" copy={content} name="Você" time={time} side="left" anchor="bubble">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => <ChatImage key={`${index}-${image.data.length}`} className="block max-h-60 max-w-full rounded-lg border border-outline-strong object-contain" image={image} index={index} />)}
        </div>
      )}
      {content && (
        <p className="m-0 whitespace-pre-wrap text-body text-primary">
          {splitSkillInvocations(content).map((part) => part.name ? <ChatSkillChip key={part.start} name={part.name} /> : splitChatMentions(part.text, mentions).map((segment, index) => (segment.mention ? <ChatMentionChip key={`${part.start}-${index}-${segment.text}`} mention={segment.mention} /> : <ChatFileText key={`${part.start}-${index}-${segment.text}`} text={segment.text} />)))}
        </p>
      )}
    </ChatStamped>
  )
}

function ChatRun({ activityDetailsVisible, bot, client, run, team, historyIds }: { activityDetailsVisible: boolean; bot: Bot; client: EngineClient; run: ChatRunState; team: ChatTeam; historyIds: Set<string> }) {
  const permissionRequest = run.permissionRequests[0]
  const pluginRequest = run.pluginRequests[0]
  const awaitingDecision = !!permissionRequest || !!pluginRequest
  const workingSilently = !activityDetailsVisible && run.status === "running" && !awaitingDecision && !run.providerWait
  const navigation = run.steps.flatMap((step) => step.type === "tool" ? step.tools : []).find((tool) => tool.status === "running" && tool.label === "Navegando com Jev")
  const handedOff = window.desktop.remote && awaitingHandoff(run)

  return (
    <>
      {!historyIds.has(run.messageId) && <ChatTurnStart activityDetailsVisible={activityDetailsVisible} bot={bot} message={run.message} team={team} time="Agora" open />}
      {run.completedMessages.filter((message) => !historyIds.has(message.id)).map((message) => <ChatMessage key={message.id} activityDetailsVisible={activityDetailsVisible} bot={bot} message={message} team={team} />)}
      <article className="flex w-fit max-w-full flex-col gap-3 self-start">
        <ChatRunActivity activityDetailsVisible={activityDetailsVisible} bot={bot} client={client} run={run} />
        {permissionRequest && <ChatStamped className="chat-request-bubble" name={bot.name} time="Agora" anchor="bubble"><ChatPermissionRequest key={permissionRequest.id} botId={bot.id} client={client} request={permissionRequest} remaining={run.permissionRequests.length - 1} /></ChatStamped>}
        {!permissionRequest && pluginRequest && <ChatStamped className="chat-request-bubble" name={bot.name} time="Agora" anchor="bubble"><ChatPluginRequest botId={bot.id} client={client} request={pluginRequest} step={run.pluginSteps[pluginRequest.id]} /></ChatStamped>}
        {workingSilently && <ChatWorkingIndicator botName={bot.name} {...(navigation ? { label: navigation.label } : {})} />}
        {handedOff && <div className="flex flex-wrap items-center gap-3"><p className="m-0 text-support text-secondary" role="status">{bot.name} aguarda sua ajuda no computador.</p><Button variant="secondary" onClick={() => focusBrowser(bot.id)}>Acompanhar página</Button></div>}
        {run.error && <div className="mt-3.5 flex items-start gap-3 max-[700px]:flex-wrap"><div className="min-w-0 flex-1"><strong className="text-control font-semibold text-primary">O bot parou</strong><p className="mt-[3px] mb-0 text-support text-secondary">{run.error}</p></div><button className="flex-none rounded-lg border border-outline-strong bg-transparent px-3 py-2 text-metadata font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={() => settleChatRun(bot.id, "available")}>Fechar</button></div>}
      </article>
    </>
  )
}

function ChatRunActivity({ activityDetailsVisible, bot, client, run }: { activityDetailsVisible: boolean; bot: Bot; client: EngineClient; run: ChatRunState }) {
  return <>
    {activityDetailsVisible && <ChatActivity activity={withoutRequestedDetails(run)} botName={bot.name} time="Agora" {...(run.providerWait ? {} : { status: run.status })} compacting={run.compacting} waitingMessage={run.waitingMessage} />}
    {run.providerWait && <ChatProviderWaiting bot={bot} client={client} wait={run.providerWait} aborting={run.status === "aborting"} />}
  </>
}

function awaitingHandoff(run: ChatRunState) {
  return run.steps.some((step) => step.type === "tool" && step.tools.some((tool) => tool.name === "browser" && tool.detail === "handoff" && tool.status === "running"))
}

function PulsingDots({ className }: { className: string }) {
  return pulsingDotDelays.map((delay) => <span key={delay} className={`size-1.5 animate-pulse rounded-full [animation-duration:900ms] motion-reduce:animate-none ${delay} ${className}`} aria-hidden="true" />)
}

function ChatWorkingIndicator({ botName, label }: { botName: string; label?: string }) {
  return <div className="flex w-fit items-center gap-2" role="status" aria-label={label ? `${botName}: ${label}` : `${botName} está trabalhando`}><PulsingDots className="bg-muted" />{label && <span className="text-support text-secondary">{label}</span>}</div>
}

function EmptyChat({ bot }: { bot: Bot }) {
  return (
    <div className="m-auto flex max-w-[520px] flex-col items-center text-center text-support text-secondary">
      <BotFace className="size-[77px] flex-none" name={bot.avatarSeed} botId={bot.id} size={77} />
      <h2 className="mt-4 mb-1.5 text-title font-semibold text-primary">{bot.name}</h2>
      <p className="m-0 max-w-[48ch] text-body leading-[1.6] text-secondary">{chatGreeting(bot.id)}</p>
    </div>
  )
}

function ChatLoading() {
  return <div className="flex min-h-[220px] items-center justify-center gap-[7px] text-muted" aria-label="Carregando conversa"><PulsingDots className="bg-secondary" /></div>
}

function ChatError({ message }: { message: string }) {
  return <div className="flex min-h-[220px] flex-col items-center justify-center gap-[7px] text-center text-muted"><strong className="text-section font-semibold text-primary">Não foi possível abrir a conversa</strong><span className="text-support text-secondary">{message}</span></div>
}

function formatMessageTime(createdAt: string) {
  const timestamp = Date.parse(createdAt)

  if (Number.isNaN(timestamp)) {
    return createdAt
  }

  return timeFormat.format(timestamp)
}

function withoutRequestedDetails(run: ChatRunState) {
  const requested = new Set(run.permissionRequests.map((request) => request.id))

  if (requested.size === 0) {
    return run
  }

  return {
    ...run,
    steps: run.steps.map((step) => step.type === "tool"
      ? { ...step, tools: step.tools.map(({ detail, ...tool }) => requested.has(tool.callId) || detail === undefined ? tool : { ...tool, detail }) }
      : step),
  }
}
