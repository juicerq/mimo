import { ProjectSortHandle, SortableProjects } from "./sortable-projects"
import { ArchiveBoxIcon, ArrowPathIcon, BookmarkIcon, EllipsisHorizontalIcon, LinkSlashIcon, PencilIcon, TrashIcon, ChevronDownIcon, Cog6ToothIcon, FolderIcon, MagnifyingGlassIcon, PlusIcon, PuzzlePieceIcon, UserPlusIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { type ReactNode, type Ref, useId, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"
import { ContextMenu } from "../ui/context-menu"
import { botRouteActions } from "../bots/bot-route-actions"
import { BotDetachDialog } from "../bots/bot-detach-member"
import { teamOf } from "../bots/team"
import { BotRemovalDialog } from "../bots/bot-removal-dialog"
import { BotDropProvider, unassignedProjectDrop } from "../bots/bot-drop"
import { SortableBots } from "../bots/sortable-bots"
import { BotFace } from "../bots/bot-face"
import { groupMembers } from "../bots/bot-members"
import { botDraftAvatarSeed, type BotDraft, botsStore, forgetBot, openCreateBot, openCreateTeamBot, openCreateProject, openPlugins, openSettings, openBotRoute, openMobileMenu, selectBot } from "../bots/bots-store"
import { chatControlAnchor } from "../chat/chat-control-menu"
import { chatStatusLabels } from "../chat/chat-status"
import { chatStore, type ChatStatus } from "../chat/chat-store"
import type { EngineClient } from "../engine-client"
import { appUpdateStore } from "../settings/app-update-store"
import { Button } from "../ui/button"
import { ConfirmationDialog } from "../ui/dialog"
import { IconButton } from "../ui/icon-button"
import { InlineAction } from "../ui/inline-action"
import { menuCardClassName, MenuOption } from "../ui/menu"
import { Tooltip, useTooltip } from "../ui/tooltip"
import { ProjectDialog } from "./project-dialog"
import { ProjectRemovalDialog } from "./project-removal-dialog"
import { SidebarLayoutMenu } from "./sidebar-layout-menu"

const teamAvatarFaceClassName = "shrink-0 text-support font-extrabold text-focus transition-transform duration-[160ms] ease-out motion-reduce:transition-none"
type TogglePinned = (bot: Bot) => void

export function ProjectsSidebar({ client, mobile = false, compact = false }: { client: EngineClient; mobile?: boolean; compact?: boolean }) {
  const draft = useSelector(botsStore, (state) => state.draft)
  const pluginsOpen = useSelector(botsStore, (state) => state.screen === "plugins")
  const settingsOpen = useSelector(botsStore, (state) => state.screen === "settings")
  const [search, setSearch] = useState("")

  return (
    <aside data-compact={compact} className={`group/sidebar flex min-h-0 min-w-0 flex-col bg-sidebar pt-3 pb-2.5 pl-3 data-[compact=true]:pl-1 ${mobile ? "flex-1 pr-3" : "pr-0 max-md:hidden"}`}>
      <div className="mb-3 flex min-h-9 items-center justify-between gap-2 group-data-[compact=true]/sidebar:gap-0">
        {compact ? <IconButton size={24} label="Buscar Bots" onClick={openMobileMenu}><MagnifyingGlassIcon aria-hidden="true" /></IconButton> : <BotSearch value={search} onChange={setSearch} />}
        <CreateMenu size={compact ? 24 : 28} />
        {!mobile && <SidebarLayoutMenu size={compact ? 24 : 28} />}
      </div>
      {draft && <DraftRow draft={draft} />}
      <SidebarProjects client={client} search={compact ? "" : search} />
      <div className="mt-auto flex flex-col gap-1 pt-2">
        <SidebarUpdateButton />
        <SidebarNavButton active={pluginsOpen} icon={<PuzzlePieceIcon className="size-4 shrink-0" aria-hidden="true" />} label="Plugins" onClick={openPlugins} />
        <SidebarNavButton active={settingsOpen} icon={<Cog6ToothIcon className="size-4 shrink-0" aria-hidden="true" />} label="Configurações" onClick={openSettings} />
      </div>
    </aside>
  )
}

function SidebarProjects({ client, search }: { client: EngineClient; search: string }) {
  const selectedBotId = useSelector(botsStore, (state) => (state.draft === null && state.screen === null ? state.selectedBotId : null))
  const draftOpen = useSelector(botsStore, (state) => state.draft !== null)
  const statuses = useSelector(chatStore, (state) => state.statuses)
  const queryClient = useQueryClient()
  const { data, error, isPending } = useQuery(client.query.projects.list.queryOptions())
  const { mutate: updatePinned, variables: pinning, isPending: pinningPending, error: pinError } = useMutation(client.query.bots.updatePinned.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
    },
  }))

  function togglePinned(bot: Bot) {
    updatePinned({ id: bot.id, pinned: !bot.pinned })
  }

  return <SidebarProjectContent
    client={client}
    data={data}
    error={error}
    isPending={isPending}
    search={search}
    draftOpen={draftOpen}
    selectedBotId={selectedBotId}
    statuses={statuses}
    pinningBotId={pinningPending ? pinning?.id : undefined}
    pinError={pinError}
    onTogglePinned={togglePinned}
  />
}

function SidebarProjectContent({ client, data, error, isPending, search, draftOpen, selectedBotId, statuses, pinningBotId, pinError, onTogglePinned }: { client: EngineClient; data: ProjectGroups | undefined; error: Error | null; isPending: boolean; search: string; draftOpen: boolean; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined>; pinningBotId?: string; pinError: Error | null; onTogglePinned: TogglePinned }) {
  const [detachingBot, setDetachingBot] = useState<Bot | null>(null)
  const [removingBot, setRemovingBot] = useState<Bot | null>(null)

  if (error) {
    return <p className="mx-2.5 my-3 text-support text-status-error">Falha ao carregar Projetos: {error.message}</p>
  }

  if (isPending) {
    return <p className="mx-2.5 my-3 text-support text-secondary">Carregando Projetos...</p>
  }

  if (!data) {
    return null
  }

  return <SidebarProjectResults client={client} data={data} search={search} draftOpen={draftOpen} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} pinError={pinError} onTogglePinned={onTogglePinned} detachingBot={detachingBot} removingBot={removingBot} onDetach={setDetachingBot} onRemove={setRemovingBot} />
}

function SidebarProjectResults({ client, data, search, draftOpen, selectedBotId, statuses, pinningBotId, pinError, onTogglePinned, detachingBot, removingBot, onDetach, onRemove }: { client: EngineClient; data: ProjectGroups; search: string; draftOpen: boolean; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined>; pinningBotId?: string; pinError: Error | null; onTogglePinned: TogglePinned; detachingBot: Bot | null; removingBot: Bot | null; onDetach: (bot: Bot | null) => void; onRemove: (bot: Bot | null) => void }) {
  const hasBots = data.projects.length > 0 || data.unassignedBots.length > 0

  if (!hasBots && draftOpen) {
    return null
  }

  if (!hasBots) {
    return <SidebarEmpty title="Nenhum Bot"><InlineAction type="button" onClick={openCreateBot}>Crie um Bot</InlineAction> ou Projeto para começar.</SidebarEmpty>
  }

  const query = search.trim().toLocaleLowerCase("pt-BR")
  const visibleData = query ? filterProjects(data, query) : data

  if (visibleData.projects.length === 0 && visibleData.unassignedBots.length === 0) {
    return <SidebarEmpty title="Nenhum Bot encontrado">Tente outro nome ou função.</SidebarEmpty>
  }

  const { pinnedBots, projects, unassignedBots } = splitPinnedBots(visibleData)
  const detachLeader = detachingBot ? teamOf(data, detachingBot).leader : undefined

  return <BotDropProvider client={client} data={data}><SidebarProjectList client={client} pinnedBots={pinnedBots} projects={projects} unassignedBots={unassignedBots} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} pinError={pinError} onTogglePinned={onTogglePinned} detachingBot={detachingBot} detachLeader={detachLeader} removingBot={removingBot} onDetach={onDetach} onRemove={onRemove} /></BotDropProvider>
}

function SidebarProjectList({ client, pinnedBots, projects, unassignedBots, selectedBotId, statuses, pinningBotId, pinError, onTogglePinned, detachingBot, detachLeader, removingBot, onDetach, onRemove }: { client: EngineClient; pinnedBots: (Bot & { members: Bot[] })[]; projects: ProjectGroups["projects"]; unassignedBots: (Bot & { members: Bot[] })[]; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined>; pinningBotId?: string; pinError: Error | null; onTogglePinned: TogglePinned; detachingBot: Bot | null; detachLeader: Bot | undefined; removingBot: Bot | null; onDetach: (bot: Bot | null) => void; onRemove: (bot: Bot | null) => void }) {
  return (
    <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto max-[720px]:block" aria-label="Projetos e Bots">
      {detachingBot && detachLeader && <BotDetachDialog bot={detachingBot} leader={detachLeader} client={client} onClose={() => onDetach(null)} />}
      {removingBot && <BotRemovalDialog bot={removingBot} client={client} onClose={() => onRemove(null)} />}
      {pinError && <p className="mx-2.5 my-3 text-support text-status-error" role="alert">Não foi possível atualizar o Bot: {pinError.message}</p>}
      {pinnedBots.length > 0 && (
        <section className="[&+&]:mt-5" aria-labelledby="pinned-bots">
          <ProjectHeading id="pinned-bots">Fixados</ProjectHeading>
          <SortableBots group="pinned" items={pinnedBots}>
            {(bot) => (
              <BotGroup bot={bot} client={client} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />
            )}
          </SortableBots>
        </section>
      )}
      <SortableProjects items={projects}>{(project) => <ProjectSection client={client} key={project.id} project={project} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />}</SortableProjects>
      {(unassignedBots.length > 0 || projects.length > 0 || pinnedBots.length > 0) && (
        <section data-project-drop={unassignedProjectDrop} data-empty={unassignedBots.length === 0} className={projects.length > 0 || pinnedBots.length > 0 ? "mt-5 border-t border-outline pt-4" : ""} aria-label="Sem projeto">
          {(projects.length > 0 || pinnedBots.length > 0) && <ProjectHeading id="unassigned-bots">Sem projeto</ProjectHeading>}
          {unassignedBots.length === 0 ? <ProjectEmpty /> : (
            <SortableBots group="unassigned" items={unassignedBots}>
              {(bot) => (
                <BotGroup bot={bot} client={client} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />
              )}
            </SortableBots>
          )}
        </section>
      )}
    </nav>
  )
}

function ProjectSection({ client, project, selectedBotId, statuses, pinningBotId, onTogglePinned, onRemove, onDetach }: { client: EngineClient; project: ProjectGroups["projects"][number]; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined>; pinningBotId?: string; onTogglePinned: TogglePinned; onRemove: (bot: Bot) => void; onDetach: (bot: Bot) => void }) {
  const [dialog, setDialog] = useState<"edit" | "remove" | null>(null)
  const actions = [
    { label: "Editar Projeto", icon: <PencilIcon />, onSelect: () => setDialog("edit") },
    { label: "Excluir Projeto", icon: <TrashIcon />, separatorBefore: true, danger: true, onSelect: () => setDialog("remove") },
  ]

  return (
    <section data-project-drop={project.id} className="group/project [&+&]:mt-5" aria-labelledby={`project-${project.id}`}>
      <ContextMenu label={`Ações de ${project.name}`} actions={actions}>{(open) => (
        <ProjectHeading id={`project-${project.id}`} projectId={project.id} action={(
          <IconButton className="opacity-0 transition-opacity duration-[120ms] group-hover/project:opacity-100 focus-visible:opacity-100 max-md:opacity-100 group-data-[compact=true]/sidebar:absolute group-data-[compact=true]/sidebar:right-0 group-data-[compact=true]/sidebar:bg-sidebar" iconSize={14} size={24} type="button" label={`Ações de ${project.name}`} onClick={open}>
            <EllipsisHorizontalIcon aria-hidden="true" />
          </IconButton>
        )}>{project.name}</ProjectHeading>
      )}</ContextMenu>
      {dialog === "edit" && <ProjectDialog client={client} project={project} onClose={() => setDialog(null)} />}
      {dialog === "remove" && <ProjectRemovalDialog client={client} project={project} onClose={() => setDialog(null)} />}
      {project.bots.length === 0 ? (
        <ProjectEmpty />
      ) : (
        <SortableBots group={project.id} items={project.bots}>
          {(bot) => (
            <BotGroup bot={bot} client={client} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />
          )}
        </SortableBots>
      )}
    </section>
  )
}

const createPopoverClassName = `${menuCardClassName} chat-control-popover inset-auto mt-1 [position-area:bottom_span-left] [position-try-fallbacks:flip-block,flip-inline]`

/** A "+" that opens Novo Bot / Novo Projeto: a dropdown on desktop, a sheet on mobile. */
export function CreateMenu({ size = 28 }: { size?: 24 | 28 | 34 }) {
  const draftOpen = useSelector(botsStore, (state) => state.draft !== null)
  const popoverId = `create-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const anchor = chatControlAnchor(popoverId)

  return (
    <>
      <span className="grid" style={anchor.trigger}>
        <IconButton className={draftOpen ? "bg-surface-active text-primary" : ""} iconSize={16} size={size} type="button" label="Criar" aria-pressed={draftOpen} popoverTarget={popoverId}>
          <PlusIcon aria-hidden="true" />
        </IconButton>
      </span>
      <div className={createPopoverClassName} id={popoverId} popover="auto" aria-label="Criar" style={anchor.popover}>
        <MenuOption icon={<UserPlusIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />} label="Novo Bot" selected={false} onSelect={openCreateBot} />
        <MenuOption icon={<FolderIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />} label="Novo Projeto" selected={false} onSelect={openCreateProject} />
      </div>
    </>
  )
}

function SidebarUpdateButton() {
  const updateReady = useSelector(appUpdateStore, (state) => state.updateReady)
  const tooltip = useTooltip()

  if (!updateReady) {
    return null
  }

  return <>
    <Button {...tooltip.anchorProps} aria-label="Atualizar e reiniciar" className="flex h-9 w-full items-center gap-2.5 px-2.5 py-0 max-md:h-11 group-data-[compact=true]/sidebar:justify-center group-data-[compact=true]/sidebar:gap-0 group-data-[compact=true]/sidebar:px-1" type="button" onClick={() => window.desktop.installUpdate()}>
      <ArrowPathIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className="group-data-[compact=true]/sidebar:sr-only">Atualizar e reiniciar</span>
    </Button>
    <Tooltip {...tooltip.popoverProps} placement="right">Atualizar e reiniciar</Tooltip>
  </>
}

function SidebarNavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  const tooltip = useTooltip()

  return <>
    <button
      {...tooltip.anchorProps}
      className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-control font-medium transition-colors duration-150 hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active group-data-[compact=true]/sidebar:justify-center group-data-[compact=true]/sidebar:gap-0 group-data-[compact=true]/sidebar:px-1 ${active ? "bg-surface-raised text-primary" : "bg-transparent text-muted"}`}
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={() => { tooltip.hide(); onClick() }}
    >
      {icon}
      <span className="group-data-[compact=true]/sidebar:sr-only">{label}</span>
    </button>
    <Tooltip {...tooltip.popoverProps} placement="right">{label}</Tooltip>
  </>
}

function DraftRow({ draft }: { draft: BotDraft }) {
  const tooltip = useTooltip()

  return <>
    <div {...tooltip.anchorProps} className="mb-0.5 flex items-center gap-2.5 rounded-lg border border-outline bg-surface-raised px-2.5 py-2.5 text-primary group-data-[compact=true]/sidebar:justify-center group-data-[compact=true]/sidebar:gap-0 group-data-[compact=true]/sidebar:px-1" aria-current="true">
      <BotFace className="size-[38px] min-w-[38px]" name={botDraftAvatarSeed(draft)} size={38} />
      <span className="flex min-w-0 max-w-full flex-1 flex-col gap-1 group-data-[compact=true]/sidebar:sr-only">
        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-control font-semibold text-primary">{draft.name || "Novo Bot"}</strong>
        <small className="text-metadata font-medium text-muted group-data-[compact=true]/sidebar:hidden">Em rascunho</small>
      </span>
    </div>
    <Tooltip {...tooltip.popoverProps} placement="right">{draft.name || "Novo Bot"} · Em rascunho</Tooltip>
  </>
}

function SidebarEmpty({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="flex min-h-45 flex-col items-center justify-center gap-1.5 text-center text-support text-secondary">
      <strong className="text-section font-semibold text-primary">{title}</strong>
      <span>{children}</span>
    </div>
  )
}

function ProjectHeading({ children, id, action, projectId }: { children: string; id: string; action?: ReactNode; projectId?: string }) {
  return (
    <div className="relative flex items-center justify-between gap-2 px-2.5 pb-1.5 group-data-[compact=true]/sidebar:gap-1 group-data-[compact=true]/sidebar:px-1">
      <h3 className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-metadata font-semibold tracking-[0.08em] text-muted uppercase group-data-[compact=true]/sidebar:tracking-normal" id={id} title={children}>
        {projectId ? <ProjectSortHandle id={projectId} name={children} /> : children}
      </h3>
      {action}
    </div>
  )
}

/** Reads "Nenhum Bot" at rest and "Solte aqui" while a Bot is carried; see `[data-project-drop]` in styles.css. */
function ProjectEmpty() {
  return <p className="bot-project-empty m-0 px-2.5 pt-[7px] pb-[9px] text-support text-muted"><span>Nenhum Bot</span></p>
}

export function BotSearch({ value, onChange, ref }: { value: string; onChange: (value: string) => void; ref?: Ref<HTMLInputElement> }) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center">
      <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 size-[15px] text-muted" aria-hidden="true" />
      <input
        className="box-border h-8 w-full rounded-lg border border-outline bg-canvas py-0 pr-2.5 pl-8 text-control text-primary placeholder:text-muted hover:border-outline-strong focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none max-md:h-9 max-md:text-base"
        type="search"
        aria-label="Buscar Bots"
        placeholder="Buscar Bots"
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function filterProjects(data: ProjectGroups, query: string) {
  const filterBots = (bots: (Bot & { members: Bot[] })[]) => bots.flatMap((bot) => {
    const leaderMatches = matchesSearch(bot, query)
    const matchingMembers = bot.members.filter((member) => matchesSearch(member, query))

    if (!leaderMatches && matchingMembers.length === 0) {
      return []
    }

    return [{ ...bot, members: leaderMatches ? bot.members : matchingMembers }]
  })

  return {
    projects: data.projects
      .map((project) => ({ ...project, bots: filterBots(project.bots) }))
      .filter((project) => project.bots.length > 0),
    unassignedBots: filterBots(data.unassignedBots),
  }
}

function matchesSearch(bot: Bot, query: string) {
  return `${bot.name} ${bot.function.outcome}`.toLocaleLowerCase("pt-BR").includes(query)
}

function splitPinnedBots(data: ProjectGroups) {
  const pinnedBots: (Bot & { members: Bot[] })[] = []
  const split = (bots: (Bot & { members: Bot[] })[]) => bots.flatMap((bot) => {
    if (bot.pinned) {
      pinnedBots.push(bot)

      return []
    }

    const pinnedMembers = bot.members.filter((member) => member.pinned).map((member) => ({ ...member, members: [] }))
    pinnedBots.push(...pinnedMembers)

    return [{ ...bot, members: bot.members.filter((member) => !member.pinned) }]
  })
  const projects = data.projects.map((project) => ({ ...project, bots: split(project.bots) }))

  return { pinnedBots, projects, unassignedBots: split(data.unassignedBots) }
}

function BotGroup({ bot, client, selectedBotId, statuses, pinningBotId, onTogglePinned, onRemove, onDetach }: { bot: Bot & { members: Bot[] }; client: EngineClient; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined>; pinningBotId?: string; onTogglePinned: TogglePinned; onRemove: (bot: Bot) => void; onDetach: (bot: Bot) => void }) {
  const hasTeam = bot.members.length > 0
  const [expanded, setExpanded] = useState(hasTeam)
  const [closedShown, setClosedShown] = useState(false)
  const closedTooltip = useTooltip()
  const memberListId = `team-members-${bot.id}`
  const closedListId = `team-closed-${bot.id}`
  const groups = groupMembers(bot.members)
  const openMembers = [...groups.permanent, ...groups.active]
  const memberSelected = bot.members.some((member) => member.id === selectedBotId)
  const highlighted = !expanded && memberSelected ? bot.id : selectedBotId

  if (!hasTeam) {
    return <li className="block border-0 p-0"><BotRow bot={bot} selected={selectedBotId === bot.id} status={statuses[bot.id] ?? "available"} pinning={pinningBotId === bot.id} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} /></li>
  }

  return (
    <li data-bot-team={bot.id} className="block border-0 p-0">
      <div className="group/leader relative">
        <BotRow bot={bot} members={expanded ? undefined : openMembers} teamLeader selected={highlighted === bot.id} status={statuses[bot.id] ?? "available"} pinning={pinningBotId === bot.id} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />
        <IconButton
          className="top-1/2 right-2 z-20 -translate-y-1/2 opacity-0 transition-[color,opacity] duration-[120ms] group-hover/leader:opacity-100 focus-visible:opacity-100 max-md:opacity-100 group-data-[compact=true]/sidebar:right-0 group-data-[compact=true]/sidebar:size-5 group-data-[compact=true]/sidebar:opacity-100"
          iconSize={13}
          position="absolute"
          size={24}
          type="button"
          label={expanded ? `Recolher time de ${bot.name}` : `Expandir time de ${bot.name}`}
          aria-expanded={expanded}
          aria-controls={memberListId}
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDownIcon className={`transition-transform duration-150 ease-out motion-reduce:transition-none ${expanded ? "rotate-180" : "rotate-0"}`} aria-hidden="true" />
        </IconButton>
      </div>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-[160ms] ease-out motion-reduce:transition-none ${expanded ? "grid-rows-[1fr] overflow-visible opacity-100" : "pointer-events-none grid-rows-[0fr] overflow-hidden opacity-0"}`}
        id={memberListId}
        aria-hidden={!expanded}
        inert={!expanded ? true : undefined}
      >
        <div className="min-h-0 overflow-hidden">
          <SortableBots group={`team-${bot.id}`} label={`Integrantes de ${bot.name}`} items={openMembers} className={`${memberListClassName} ${expanded ? "py-0.5" : "py-0"}`}>
            {(member) => <MemberItem key={member.id} member={member} selected={highlighted === member.id} status={statuses[member.id] ?? "available"} pinning={pinningBotId === member.id} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />}
          </SortableBots>
          <ul className={memberListClassName} id={closedListId}>
            {groups.closed.length > 0 && (
              <li className={`${memberItemClassName} group/closed relative`}>
                <button {...closedTooltip.anchorProps} className="mb-0.5 flex w-full cursor-pointer items-center gap-1.5 rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 pr-9.5 text-left text-metadata font-medium text-muted hover:text-primary focus-visible:border-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-data-[compact=true]/sidebar:gap-1 group-data-[compact=true]/sidebar:px-1 group-data-[compact=true]/sidebar:pr-7" type="button" aria-label={`Encerrados de ${bot.name}`} aria-expanded={closedShown} aria-controls={closedListId} onClick={() => { closedTooltip.hide(); setClosedShown((current) => !current) }}>
                  <ArchiveBoxIcon className="hidden size-4 shrink-0 group-data-[compact=true]/sidebar:block" aria-hidden="true" />
                  <span className="group-data-[compact=true]/sidebar:sr-only">Encerrados</span>
                  <ChevronDownIcon className={`size-3 transition-transform duration-150 ease-out motion-reduce:transition-none ${closedShown ? "rotate-180" : "rotate-0"}`} aria-hidden="true" />
                </button>
                <Tooltip {...closedTooltip.popoverProps} placement="right">Encerrados de {bot.name} ({groups.closed.length})</Tooltip>
                <ClosedMembersCleanup client={client} leaderName={bot.name} members={groups.closed} />
              </li>
            )}
            {closedShown && groups.closed.map((member) => <MemberItem key={member.id} member={member} selected={highlighted === member.id} pinning={pinningBotId === member.id} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />)}
          </ul>
        </div>
      </div>
    </li>
  )
}

const memberListClassName = "relative mx-2 mt-0 mb-0 ml-5.5 min-h-0 min-w-0 list-none overflow-hidden pr-0 pl-2.5 group-data-[compact=true]/sidebar:mx-0 group-data-[compact=true]/sidebar:pl-2.5"

function ClosedMembersCleanup({ client, leaderName, members }: { client: EngineClient; leaderName: string; members: Bot[] }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const { mutateAsync: removeBot, isPending: removing } = useMutation(client.query.bots.remove.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.projects.key() })
      void queryClient.invalidateQueries({ queryKey: client.query.plugins.key() })
    },
  }))

  async function removeClosed() {
    const results = await Promise.allSettled(members.map((member) => removeBot({ id: member.id })))

    members.forEach((member, index) => {
      if (results[index]?.status === "fulfilled") {
        forgetBot(member.id)
      }
    })
  }

  return (
    <>
      <IconButton className="top-1/2 right-2 z-20 -translate-y-1/2 group-data-[compact=true]/sidebar:right-0" iconSize={13} position="absolute" size={24} type="button" label="Excluir encerrados" disabled={removing} onClick={() => setConfirming(true)}>
        <TrashIcon aria-hidden="true" />
      </IconButton>
      {confirming && (
        <ConfirmationDialog
          icon={<TrashIcon />}
          title="Excluir encerrados"
          onClose={() => !removing && setConfirming(false)}
          actions={(
            <>
              <Button variant="text" type="button" autoFocus disabled={removing} onClick={() => setConfirming(false)}>Cancelar</Button>
              <Button variant="danger" type="button" disabled={removing} onClick={() => { setConfirming(false); void removeClosed() }}>{removing ? "Excluindo..." : "Excluir"}</Button>
            </>
          )}
        >
          <p className="m-0 text-body text-secondary">{members.length === 1 ? `O integrante encerrado do time de ${leaderName} será excluído com a conversa e os arquivos dele.` : `Os ${members.length} integrantes encerrados do time de ${leaderName} serão excluídos com as conversas e os arquivos deles.`}</p>
        </ConfirmationDialog>
      )}
    </>
  )
}

const memberItemClassName = "relative block border-0 p-0 before:absolute before:top-[-2px] before:bottom-1/2 before:left-[-10px] before:w-2 before:rounded-bl before:border-b before:border-l before:border-outline before:content-[''] after:absolute after:top-1/2 after:bottom-[-2px] after:left-[-10px] after:w-px after:bg-outline after:content-[''] last:after:hidden"

function MemberItem({ member, selected, status, pinning, onTogglePinned, onRemove, onDetach }: { member: Bot; selected: boolean; status?: ChatStatus; pinning: boolean; onTogglePinned: TogglePinned; onRemove: (bot: Bot) => void; onDetach: (bot: Bot) => void }) {
  return (
    <li className={`${memberItemClassName}${member.closed ? " opacity-60" : ""}`}>
      <BotRow bot={member} member selected={selected} status={status} pinning={pinning} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />
    </li>
  )
}

function describeMember(bot: Bot) {
  if (bot.temporary && !bot.closed) {
    return `Temporário · ${bot.function.outcome}`
  }

  return bot.function.outcome
}

function BotRow({ bot, member = false, members, selected, status, teamLeader = false, pinning, onTogglePinned, onRemove, onDetach }: { bot: Bot; member?: boolean; members?: Bot[]; selected: boolean; status?: ChatStatus; teamLeader?: boolean; pinning: boolean; onTogglePinned: TogglePinned; onRemove: (bot: Bot) => void; onDetach: (bot: Bot) => void }) {
  const avatarSizeClassName = members?.length ? "h-[38px] w-[51px] min-w-[51px]" : "size-[38px] min-w-[38px]"
  const selectionClassName = selected ? "border-outline bg-surface-raised text-primary" : "border-transparent bg-transparent text-secondary"
  const tooltip = useTooltip()
  const actions = [
    ...botRouteActions(bot, { name: "chat" }).map((action) => ({ label: action.label, icon: action.icon, onSelect: () => { selectBot(bot.id); openBotRoute({ name: action.name }) } })),
    { label: bot.pinned ? "Desafixar" : "Fixar", icon: <BookmarkIcon />, separatorBefore: true, disabled: pinning, onSelect: () => onTogglePinned(bot) },
    { label: "Novo Bot nesse time", icon: <UserPlusIcon />, onSelect: () => openCreateTeamBot(bot) },
    ...(!bot.temporary ? [
      { label: "Nova Rotina", icon: <PlusIcon />, onSelect: () => { selectBot(bot.id); openBotRoute({ name: "routine", id: "new" }) } },
    ] : []),
    ...(bot.leaderBotId && !bot.temporary ? [{ label: "Desvincular do time", icon: <LinkSlashIcon />, onSelect: () => onDetach(bot) }] : []),
    { label: "Excluir Bot", icon: <TrashIcon />, separatorBefore: true, danger: true, onSelect: () => onRemove(bot) },
  ]

  return (
    <ContextMenu label={`Ações de ${bot.name}`} actions={actions}>{() => <>
      <button
        {...tooltip.anchorProps}
        className={`group/row relative mb-0.5 flex w-full items-center gap-2.5 rounded-lg border px-2.5 text-left hover:border-outline hover:bg-surface-raised focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent disabled:hover:bg-transparent group-data-[compact=true]/sidebar:justify-center group-data-[compact=true]/sidebar:gap-0 group-data-[compact=true]/sidebar:px-1 ${selectionClassName} ${member ? "py-2" : "py-2.5"} ${teamLeader ? "pr-9.5 group-data-[compact=true]/sidebar:pr-5" : ""}`}
        type="button"
        aria-label={bot.name}
        data-bot-id={bot.id}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        aria-current={selected ? "true" : undefined}
        onClick={() => { tooltip.hide(); selectBot(bot.id) }}
      >
        <span className={`z-10 flex shrink-0 flex-row gap-0 overflow-visible whitespace-normal ${avatarSizeClassName}`}>
          <BotAvatar bot={bot} members={members} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden group-data-[compact=true]/sidebar:sr-only">
          <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-control font-semibold text-primary group-data-[compact=true]/sidebar:text-metadata">{bot.name}</strong>
          <small className="overflow-hidden text-ellipsis whitespace-nowrap text-metadata font-medium text-muted group-data-[compact=true]/sidebar:hidden">{describeMember(bot)}</small>
        </span>
      </button>
      <Tooltip {...tooltip.popoverProps} placement="right">
        <span className="block font-semibold">{bot.name}</span>
        {status && <span className="block text-secondary">{chatStatusLabels[status]}</span>}
      </Tooltip>
    </>}</ContextMenu>
  )
}

function BotAvatar({ bot, members }: { bot: Bot; members?: Bot[] }) {
  if (!members || members.length === 0) {
    return (
      <BotFace
        className="grid size-[38px] shrink-0 place-items-center text-support font-extrabold text-focus"
        name={bot.avatarSeed}
        botId={bot.id}
        size={38}
      />
    )
  }

  const memberCountLabel = members.length === 1 ? "1 integrante" : `${members.length} integrantes`

  const [first, second] = members

  return (
    <span className="group/stack relative block h-[38px] w-[51px] min-w-[51px] shrink-0 overflow-visible" role="img" aria-label={`${bot.name} lidera ${memberCountLabel}`}>
      <BotFace
        className={`absolute top-[7px] z-1 size-[24px] ${teamAvatarFaceClassName} ${second ? "left-0 group-hover/stack:-translate-x-0.75" : "left-[2px] group-hover/stack:-translate-x-0.5"}`}
        name={first.avatarSeed}
        botId={first.id}
        size={24}
      />
      {second && (
        <BotFace
          className={`absolute top-[7px] right-0 z-1 size-[24px] ${teamAvatarFaceClassName} group-hover/stack:translate-x-0.75`}
          name={second.avatarSeed}
          botId={second.id}
          size={24}
        />
      )}
      <BotFace
        className={`absolute top-[3px] z-2 size-[32px] ${teamAvatarFaceClassName} ${second ? "left-[9px]" : "left-[15px]"}`}
        name={bot.avatarSeed}
        botId={bot.id}
        size={32}
      />
    </span>
  )
}
