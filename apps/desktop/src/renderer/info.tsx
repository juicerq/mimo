import { useCallback, useEffect, useState } from "react";
import { Setting } from "@renderer/components/setting";
import { cn } from "cn";
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

	useEffect(() => {
		function onKey(event: KeyboardEvent): void {
			if (event.key === "Escape") {
				close();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [close]);

	return { open: overlay ? overlaid : docked, overlay, toggle, close };
}

interface InfoProps {
	name: string;
	open: boolean;
	overlay: boolean;
	level: Detail;
	onClose: () => void;
	onLevel: (level: Detail) => void;
}

export function Info({ name, open, overlay, level, onClose, onLevel }: InfoProps) {
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
					<Setting label="Detalhe" value={level} options={DETAIL_LEVELS} names={DETAIL_NAMES} onChange={onLevel} />
				</div>
			</aside>
		</>
	);
}
