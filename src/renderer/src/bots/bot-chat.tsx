import { BotArchive } from "./bot-archive"
import { ClockIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"
import type { Routine } from "@src/shared/routines"
import { chatStore } from "../chat/chat-store"
import { ChatEdgeTab } from "../chat/chat-edge-tab"
import { ChatWorkspace } from "../chat/chat-workspace"
import type { EngineClient } from "../engine-client"
import { EmptyState } from "../ui/empty-state"
import { IconButton } from "../ui/icon-button"
import { botRouteActions } from "./bot-route-actions"
import { InlineAction } from "../ui/inline-action"
import { ProviderWelcome } from "../settings/provider-welcome"
import { useIsMobile } from "../ui/use-is-mobile"
import { BotDetails } from "./bot-details"
import { BotMemory } from "./bot-memory"
import { BotMembers } from "./bot-members"
import { BotRoutineEditor } from "./bot-routine-editor"
import { BotRoutines } from "./bot-routines"
import { BotSettings } from "./bot-settings"
import { BotTriggerEditor } from "./bot-trigger-editor"
import { BotTriggers } from "./bot-triggers"
import { type BotRoute, botsStore, openBotRoute, openCreateBot } from "./bots-store"
import { findTeamBot, teamOf } from "./team"

export function BotChat({ client, botId }: { client: EngineClient; botId: string | null }) {
  const mobile = useIsMobile()
  const route = useSelector(botsStore, (state) => state.botRoute)
  const { data: groups, error, isPending } = useQuery(client.query.projects.list.queryOptions())
  const bot = botId ? findTeamBot(groups, botId) : undefined

  if (error) {
    return <p className="p-7 text-support text-status-error">Falha ao carregar os Bots: {error.message}</p>
  }

  if (isPending) {
    return <p className="p-7 text-muted">{botId ? "Abrindo Bot..." : "Carregando Bots..."}</p>
  }

  if (!botId) {
    if (groups && (groups.unassignedBots.length > 0 || groups.projects.some((project) => project.bots.length > 0))) {
      return <EmptyState title="Escolha um Bot" description={<>Abra um da lista ou <InlineAction type="button" onClick={openCreateBot}>crie um novo</InlineAction>.</>} />
    }

    return <ProviderWelcome client={client} />
  }

  if (!bot) {
    return <EmptyState title="Bot não encontrado" description="Ele foi removido. Escolha outro da lista." />
  }

  return (
    <>
      <BotRouteScreen bot={bot} client={client} groups={groups} route={route} />
      {!mobile && <BotRouteTab bot={bot} client={client} route={route} />}
    </>
  )
}

function BotRouteScreen({ bot, client, groups, route }: { bot: Bot; client: EngineClient; groups: ProjectGroups | undefined; route: BotRoute }) {
  const { leader } = teamOf(groups, bot)
  const close = () => openBotRoute({ name: "chat" })
  const openRoutines = () => openBotRoute({ name: "routines" })

  if (route.name === "details") {
    return <BotDetails bot={bot} groups={groups} />
  }

  if (route.name === "members" && !bot.leaderBotId) {
    return <BotMembers key={bot.id} bot={bot} client={client} groups={groups} create={route.create} onClose={close} />
  }

  if (route.name === "settings") {
    return <BotSettings bot={bot} client={client} onClose={close} />
  }

  if (route.name === "routines") {
    return <BotRoutines bot={bot} client={client} onClose={close} onCreate={() => openBotRoute({ name: "routine", id: "new" })} onEdit={(id) => openBotRoute({ name: "routine", id })} />
  }

  if (route.name === "archive") {
    return <BotArchive key={bot.id} bot={bot} client={client} onClose={close} />
  }

  if (route.name === "memory") {
    return <BotMemory bot={bot} client={client} leader={leader} onClose={close} />
  }

  if (route.name === "triggers") {
    return <BotTriggers bot={bot} client={client} onClose={close} onEdit={(id) => openBotRoute({ name: "trigger", id })} />
  }

  if (route.name === "trigger") {
    return <BotTriggerEditor key={`${bot.id}:${route.id}`} bot={bot} client={client} triggerId={route.id} onClose={() => openBotRoute({ name: "triggers" })} />
  }

  if (route.name === "routine") {
    return <BotRoutineEditor bot={bot} client={client} routineId={route.id} onClose={openRoutines} />
  }

  return <ChatWorkspace bot={bot} client={client} />
}

function BotRouteTab({ bot, client, route }: { bot: Bot; client: EngineClient; route: BotRoute }) {
  const { data: routines } = useQuery({ ...client.query.routines.list.queryOptions({ input: { botId: bot.id } }), enabled: !bot.temporary })
  const favorites = routines?.filter((routine) => routine.favorite) ?? []

  return (
    <ChatEdgeTab>
      {botRouteActions(bot, route).map((action) => (
        <IconButton key={action.name} iconSize={16} current={action.current} type="button" label={`${action.label} de ${bot.name}`} tooltipPlacement="left" onClick={action.select}>{action.icon}</IconButton>
      ))}
      {favorites.length > 0 && <span className="my-0.5 h-px w-5 bg-outline" aria-hidden="true" />}
      {favorites.map((routine, index) => <RoutineShortcut key={routine.id} bot={bot} client={client} routine={routine} position={index + 1} />)}
    </ChatEdgeTab>
  )
}

function RoutineShortcut({ bot, client, routine, position }: { bot: Bot; client: EngineClient; routine: Routine; position: number }) {
  const working = useSelector(chatStore, (state) => !!state.runs[bot.id])
  const { mutate: fireNow, isPending, error } = useMutation(client.query.routines.fireNow.mutationOptions({ onSuccess: () => openBotRoute({ name: "chat" }) }))

  return (
    <IconButton iconSize={16} type="button" disabled={working || isPending} label={error ? `Falha ao disparar ${routine.name}: ${error.message}` : `Disparar ${routine.name}`} tooltipPlacement="left" onClick={() => fireNow({ id: routine.id })}>
      <ClockIcon aria-hidden="true" />
      <span className={`absolute right-1 bottom-1 grid size-3 place-items-center rounded-full bg-surface-raised text-[9px] leading-none font-semibold tabular-nums ring-1 ring-outline ${error ? "text-status-error" : "text-secondary"}`} aria-hidden="true">{position}</span>
    </IconButton>
  )
}
