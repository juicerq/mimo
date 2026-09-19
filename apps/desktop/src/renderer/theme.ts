import { useLayoutEffect, useState } from "react";

export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_NAMES: Record<Theme, string> = { light: "Claro", dark: "Escuro" };

const THEME = "mimo:theme";

function savedTheme(): Theme {
	const saved = localStorage.getItem(THEME);
	if (saved === "light" || saved === "dark") {
		return saved;
	}
	if (matchMedia("(prefers-color-scheme: dark)").matches) {
		return "dark";
	}
	return "light";
}

export function useTheme() {
	const [theme, setTheme] = useState(savedTheme);

	useLayoutEffect(() => {
		document.documentElement.classList.toggle("dark", theme === "dark");
	}, [theme]);

	function choose(next: Theme): void {
		localStorage.setItem(THEME, next);
		setTheme(next);
	}

	return [theme, choose] as const;
}
