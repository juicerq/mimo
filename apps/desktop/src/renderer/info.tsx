import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { DETAIL_LEVELS, DETAIL_NAMES, type Detail } from "./transcript";

const DOCKED = "mimo:info";
const OVERLAY = "(max-width: 959px)";

export function useInfoPanel() {
	const [docked, setDocked] = useState(() => localStorage.getItem(DOCKED) !== "closed");
	const [narrow, setNarrow] = useState(() => matchMedia(OVERLAY).matches);
	const [overlaid, setOverlaid] = useState(false);

	useEffect(() => {
		localStorage.setItem(DOCKED, docked ? "open" : "closed");
	}, [docked]);

	useEffect(() => {
		const query = matchMedia(OVERLAY);
		function onChange(): void {
			setNarrow(query.matches);
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

	return { open: narrow ? overlaid : docked, toggle, close };
}

interface InfoProps {
	name: string;
	level: Detail;
	theme: "light" | "dark";
	onLevel: (level: Detail) => void;
	onTheme: () => void;
}

export function Info({ name, level, theme, onLevel, onTheme }: InfoProps) {
	const dark = theme === "dark";

	return (
		<aside className="info" aria-label={`Sobre ${name}`}>
			<div className="info-body">
				<section>
					<h3>Detalhe</h3>
					<div className="seg" role="radiogroup" aria-label="Detalhe">
						{DETAIL_LEVELS.map((entry) => (
							<button key={entry} type="button" role="radio" aria-checked={entry === level} onClick={() => onLevel(entry)}>
								{DETAIL_NAMES[entry]}
							</button>
						))}
					</div>
					<p className="hint">Ctrl+O alterna.</p>
				</section>
			</div>
			<footer className="info-foot">
				<button
					type="button"
					className="icon"
					aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
					title={dark ? "Tema claro" : "Tema escuro"}
					onClick={onTheme}
				>
					{dark ? <SunIcon /> : <MoonIcon />}
				</button>
			</footer>
		</aside>
	);
}
