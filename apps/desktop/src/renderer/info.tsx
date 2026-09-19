import { MoonIcon, SunIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { IconButton } from "@renderer/components/icon-button";
import { Kbd, KbdGroup } from "@renderer/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@renderer/components/ui/toggle-group";
import { cn } from "@renderer/lib/utils";
import { DETAIL_LEVELS, DETAIL_NAMES, type Detail } from "./transcript";

const DOCKED = "mimo:info";
const OVERLAY = "(width < 60rem)";

export function useInfoPanel() {
	const [docked, setDocked] = useState(() => localStorage.getItem(DOCKED) !== "closed");
	const [overlay, setOverlay] = useState(() => matchMedia(OVERLAY).matches);
	const [overlaid, setOverlaid] = useState(false);

	useEffect(() => {
		localStorage.setItem(DOCKED, docked ? "open" : "closed");
	}, [docked]);

	useEffect(() => {
		const query = matchMedia(OVERLAY);
		function onChange(): void {
			setOverlay(query.matches);
			setOverlaid(false);
		}
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);

	const toggle = useCallback(() => {
		if (matchMedia(OVERLAY).matches) {
			setOverlaid((open) => !open);
			return;
		}
		setDocked((open) => !open);
	}, []);

	const close = useCallback(() => setOverlaid(false), []);

	return { open: overlay ? overlaid : docked, overlay, toggle, close };
}

function isDetail(value: unknown): value is Detail {
	return DETAIL_LEVELS.some((level) => level === value);
}

interface InfoProps {
	name: string;
	open: boolean;
	overlay: boolean;
	level: Detail;
	theme: "light" | "dark";
	onClose: () => void;
	onLevel: (level: Detail) => void;
	onTheme: () => void;
}

export function Info({ name, open, overlay, level, theme, onClose, onLevel, onTheme }: InfoProps) {
	const dark = theme === "dark";

	if (!open && !overlay) {
		return null;
	}

	return (
		<>
			{overlay && open && <div className="fixed inset-x-0 top-bar bottom-0 z-10 bg-scrim" onClick={onClose} />}
			<aside
				aria-label={`Sobre ${name}`}
				className={cn(
					"flex w-74 shrink-0 flex-col border-l bg-background",
					overlay && "fixed top-bar right-0 bottom-0 z-20 shadow-lg transition-[translate,visibility] duration-200 ease-out",
					overlay && !open && "invisible translate-x-full",
				)}
			>
				<div className="min-h-0 flex-1 overflow-y-auto p-5">
					<section>
						<h3 className="mb-2 text-xs font-medium text-muted-foreground">Detalhe</h3>
						<ToggleGroup
							aria-label="Detalhe"
							value={[level]}
							onValueChange={(value) => {
								const next = value[0];
								if (isDetail(next)) {
									onLevel(next);
								}
							}}
							spacing={0.5}
							className="w-full rounded-lg bg-muted p-0.5"
						>
							{DETAIL_LEVELS.map((entry) => (
								<ToggleGroupItem
									key={entry}
									value={entry}
									size="sm"
									className="flex-1 rounded-md text-muted-foreground hover:bg-transparent aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
								>
									{DETAIL_NAMES[entry]}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
						<p className="mt-2 text-xs text-muted-foreground">
							<KbdGroup>
								<Kbd>Ctrl</Kbd>
								<Kbd>O</Kbd>
							</KbdGroup>{" "}
							alterna.
						</p>
					</section>
				</div>
				<footer className="flex shrink-0 px-3 pt-2 pb-3">
					<IconButton label={dark ? "Usar tema claro" : "Usar tema escuro"} tip={dark ? "Tema claro" : "Tema escuro"} side="top" onClick={onTheme}>
						{dark ? <SunIcon /> : <MoonIcon />}
					</IconButton>
				</footer>
			</aside>
		</>
	);
}
