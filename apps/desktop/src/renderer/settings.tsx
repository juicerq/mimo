import { KeyRoundIcon, SettingsIcon, SlidersHorizontalIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { IconButton } from "@renderer/components/icon-button";
import { Setting } from "@renderer/components/setting";
import { Dialog, DialogContent, DialogTitle } from "@renderer/components/ui/dialog";
import { Accounts } from "./accounts";
import { THEME_NAMES, THEMES, useTheme } from "./theme";
import { DETAIL_LEVELS, DETAIL_NAMES, type Detail } from "./transcript";

const PANES = [
	{ id: "app", name: "Aplicativo", icon: SlidersHorizontalIcon },
	{ id: "accounts", name: "Contas", icon: KeyRoundIcon },
] as const;

type Pane = (typeof PANES)[number]["id"];

function Nav({ pane, onPane }: { pane: Pane; onPane: (pane: Pane) => void }) {
	return (
		<nav aria-label="Configurações" className="flex w-44 shrink-0 flex-col gap-0.5 border-r p-2 surface-sidebar">
			{PANES.map((entry) => (
				<button
					key={entry.id}
					type="button"
					aria-current={entry.id === pane}
					className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:surface-sidebar-hover aria-[current=true]:text-foreground aria-[current=true]:surface-sidebar-active"
					onClick={() => onPane(entry.id)}
				>
					<entry.icon className="size-4 shrink-0" />
					{entry.name}
				</button>
			))}
		</nav>
	);
}

function Body({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<DialogTitle className="shrink-0 px-4 pt-4 pb-3">{title}</DialogTitle>
			<div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4">{children}</div>
		</div>
	);
}

export function Settings({ level, onLevel }: { level: Detail; onLevel: (level: Detail) => void }) {
	const [open, setOpen] = useState(false);
	const [pane, setPane] = useState<Pane>("app");
	const [theme, chooseTheme] = useTheme();

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<IconButton label="Configurações" side="top" onClick={() => setOpen(true)}>
				<SettingsIcon />
			</IconButton>
			<DialogContent className="flex h-140 max-h-[calc(100%-4rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
				<Nav pane={pane} onPane={setPane} />
				{pane === "app" && (
					<Body title="Aplicativo">
						<Setting label="Tema" value={theme} options={THEMES} names={THEME_NAMES} onChange={chooseTheme} />
						<Setting label="Detalhe" value={level} options={DETAIL_LEVELS} names={DETAIL_NAMES} onChange={onLevel} />
					</Body>
				)}
				{pane === "accounts" && (
					<Body title="Contas">
						<Accounts />
					</Body>
				)}
			</DialogContent>
		</Dialog>
	);
}
