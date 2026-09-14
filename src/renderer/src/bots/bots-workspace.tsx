import { useSelector } from "@tanstack/react-store"
import { Bars3Icon } from "@heroicons/react/24/outline"
import { appSettingsStore } from "../settings/app-settings-store"
import { SidebarLayoutMenu } from "../projects/sidebar-layout-menu"
import { IconButton } from "../ui/icon-button"
import { PluginsScreen } from "../plugins/plugins-screen"
import { MobileMenu } from "../projects/mobile-menu"
import { MobileBots } from "../projects/mobile-bots"
import { useIsMobile } from "../ui/use-is-mobile"
import { ConnectionBanner } from "../connection"
import { ProjectDialog } from "../projects/project-dialog"
import { ProjectsSidebar } from "../projects/projects-sidebar"
import { SettingsScreen } from "../settings/settings-screen"
import type { EngineClient } from "../engine-client"
import { BotChat } from "./bot-chat"
import { botsStore, closeDialog, openMobileMenu } from "./bots-store"
import { NewBot } from "./new-bot"
import { WorkspaceTopBar } from "./workspace-top-bar"

export function BotsWorkspace({ client }: { client: EngineClient }) {
  const dialog = useSelector(botsStore, (state) => state.dialog)
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)
  const draft = useSelector(botsStore, (state) => state.draft)
  const screen = useSelector(botsStore, (state) => state.screen)
  const mobileList = useSelector(botsStore, (state) => state.mobileList)
  const mobile = useIsMobile()
  const sidebarMode = useSelector(appSettingsStore, (state) => state.sidebarMode)
  const menuOpen = useSelector(botsStore, (state) => state.mobileMenuOpen)
  const columns = { traditional: "md:grid-cols-[286px_minmax(0,1fr)]", compact: "md:grid-cols-[128px_minmax(0,1fr)]", hidden: "md:grid-cols-1 md:pl-3" }

  function workspaceContent() {
    if (screen === "plugins") {
      return <PluginsScreen client={client} />
    }

    if (screen === "settings") {
      return <SettingsScreen client={client} />
    }

    if (draft) {
      return <NewBot client={client} draft={draft} />
    }

    return <BotChat key={selectedBotId ?? "no-bot"} client={client} botId={selectedBotId} />
  }

  return (
    <section className={`grid size-full min-h-0 grid-cols-1 gap-3 overflow-hidden bg-canvas py-3 pr-3 max-md:gap-0 max-md:p-0 ${columns[sidebarMode]}`} aria-label="Bots">
      {!mobile && sidebarMode !== "hidden" && <ProjectsSidebar client={client} compact={sidebarMode === "compact"} />}
      <MobileMenu client={client} />
      <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-shell border border-outline bg-surface max-md:rounded-none max-md:border-0 max-md:pt-[var(--safe-top)]">
        {!mobile && sidebarMode === "hidden" && <div className="flex h-12 shrink-0 items-center gap-1 px-3 pr-[var(--window-controls-clearance)]">
          <IconButton label="Abrir menu" aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={openMobileMenu}><Bars3Icon aria-hidden="true" /></IconButton>
          <SidebarLayoutMenu />
        </div>}
        <ConnectionBanner />
        {mobile && mobileList ? <MobileBots client={client} /> : <>
          {mobile && <WorkspaceTopBar client={client} />}
          <div className="relative min-h-0 min-w-0 flex-1">{workspaceContent()}</div>
        </>}
      </div>
      {dialog === "create-project" && <ProjectDialog client={client} onClose={closeDialog} />}
    </section>
  )
}
