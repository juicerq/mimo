import { Bars3Icon, RectangleGroupIcon, ViewColumnsIcon } from "@heroicons/react/24/outline"
import { useSelector } from "@tanstack/react-store"
import { useId } from "react"
import { closeMobileMenu } from "../bots/bots-store"
import { chatControlAnchor } from "../chat/chat-control-menu"
import { appSettingsStore, setSidebarMode, type SidebarMode } from "../settings/app-settings-store"
import { IconButton } from "../ui/icon-button"
import { menuCardClassName, MenuOption } from "../ui/menu"

const modes = [
  { value: "traditional", label: "Tradicional", icon: ViewColumnsIcon },
  { value: "compact", label: "Só avatares", icon: RectangleGroupIcon },
  { value: "hidden", label: "Oculta, como no mobile", icon: Bars3Icon },
] satisfies { value: SidebarMode; label: string; icon: typeof Bars3Icon }[]

export function SidebarLayoutMenu({ size = 28 }: { size?: 24 | 28 }) {
  const mode = useSelector(appSettingsStore, (state) => state.sidebarMode)
  const popoverId = `sidebar-layout-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const anchor = chatControlAnchor(popoverId)

  return <>
    <span className="grid" style={anchor.trigger}>
      <IconButton size={size} label="Tamanho da sidebar" tooltipPlacement="bottom" popoverTarget={popoverId}><ViewColumnsIcon aria-hidden="true" /></IconButton>
    </span>
    <div id={popoverId} popover="auto" aria-label="Tamanho da sidebar" style={anchor.popover} className={`${menuCardClassName} inset-auto mt-1 [position-area:bottom_span-right] [position-try-fallbacks:flip-block,flip-inline]`}>
      {modes.map(({ value, label, icon: Icon }) => <MenuOption key={value} label={label} icon={<Icon className="size-4 shrink-0" aria-hidden="true" />} selected={mode === value} onSelect={() => { setSidebarMode(value); closeMobileMenu() }} />)}
    </div>
  </>
}
