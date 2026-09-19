import { useLayoutEffect, useState } from "react";

type Theme = "light" | "dark";

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
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	function toggle(): void {
		const next = theme === "dark" ? "light" : "dark";
		localStorage.setItem(THEME, next);
		setTheme(next);
	}

	return [theme, toggle] as const;
}
