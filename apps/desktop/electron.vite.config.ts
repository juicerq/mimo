import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "electron-vite";
import agent from "../agent/package.json" with { type: "json" };

const markdownAsText: Plugin = {
	name: "markdown-as-text",
	transform(code, id) {
		if (!id.endsWith(".md")) {
			return null;
		}
		return { code: `export default ${JSON.stringify(code)};`, map: null };
	},
};

export default defineConfig({
	main: {
		plugins: [markdownAsText, {
			name: "sqlite-migrations",
			closeBundle() {
				cpSync(fileURLToPath(new URL("../agent/src/storage/migrations", import.meta.url)), fileURLToPath(new URL("./out/main/migrations", import.meta.url)), { recursive: true });
			},
		}],
		resolve: { alias: { "@agent": fileURLToPath(new URL("../agent/src", import.meta.url)) } },
		build: {
			externalizeDeps: { include: Object.keys(agent.dependencies) },
		},
	},
	preload: {
		build: {
			rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } },
		},
	},
	renderer: {
		plugins: [react(), tailwindcss()],
		resolve: { alias: { "@renderer": fileURLToPath(new URL("src/renderer", import.meta.url)) } },
	},
});
