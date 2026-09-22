import { XMarkIcon } from "@heroicons/react/24/outline"
import { useSelector } from "@tanstack/react-store"
import { BotPage } from "../bots/bot-page"
import { closeWorkspaceScreen } from "../bots/bots-store"
import type { EngineClient } from "../engine-client"
import { ChatEdgeTab } from "../chat/chat-edge-tab"
import { IconButton } from "../ui/icon-button"
import { SettingsRow, SettingsSection, settingsPanelClassName } from "../ui/settings-section"
import { Switch } from "../ui/switch"
import { useEscape } from "../ui/use-escape"
import { appSettingsStore, setActivityDetailsVisible } from "./app-settings-store"
import { ProviderConnections } from "./provider-connections"
import { MemorySettings } from "./memory-settings"
import { MobileAccessSettings } from "./mobile-access"
import { JevSettings } from "./jev-settings"

export function SettingsScreen({ client }: { client: EngineClient }) {
  const activityDetailsVisible = useSelector(appSettingsStore, (state) => state.activityDetailsVisible)
  useEscape(closeWorkspaceScreen)

  return (
    <>
      <BotPage label="Configurações">
        <header>
          <h2 className="m-0 text-title font-semibold text-primary max-md:hidden">Configurações</h2>
          <p className="m-0 mt-1 text-support font-normal text-muted">Preferências do Mimo neste computador</p>
        </header>
        {import.meta.env.DEV && (
          <SettingsSection title="Conversa">
            <div className={settingsPanelClassName}>
              <SettingsRow label="Mostrar detalhes do trabalho" description="Veja o raciocínio e as ações dos Bots durante o trabalho.">
                <Switch checked={activityDetailsVisible} aria-label="Mostrar detalhes do trabalho" onChange={setActivityDetailsVisible} />
              </SettingsRow>
            </div>
          </SettingsSection>
        )}
        <ProviderConnections client={client} />
        <JevSettings client={client} />
        <MemorySettings client={client} />
        <MobileAccessSettings />
      </BotPage>
      <ChatEdgeTab>
        <IconButton iconSize={16} type="button" label="Fechar configurações" tooltipPlacement="left" onClick={closeWorkspaceScreen}><XMarkIcon aria-hidden="true" /></IconButton>
      </ChatEdgeTab>
    </>
  )
}
