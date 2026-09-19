import { join } from "node:path";
import { startRoutines } from "@agent/routines/dispatcher";
import { loadEnv } from "@agent/storage/home";
import { RPCHandler } from "@orpc/server/message-port";
import { app, BrowserWindow, ipcMain } from "electron";
import { router } from "./router";

loadEnv();

const handler = new RPCHandler(router);

ipcMain.on("rpc", (event) => {
	for (const port of event.ports) {
		handler.upgrade(port);
		port.start();
	}
});

function openWindow(): void {
	const window = new BrowserWindow({
		width: 1100,
		height: 720,
		title: "mimo",
		backgroundColor: "#0b0b0c",
		webPreferences: { preload: join(import.meta.dirname, "../preload/index.cjs") },
	});
	window.webContents.on("will-navigate", (event) => event.preventDefault());
	window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	const devServer = process.env.ELECTRON_RENDERER_URL;
	if (devServer) {
		void window.loadURL(devServer);
		return;
	}
	void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}

app.on("window-all-closed", () => app.quit());

app.on("ready", () => {
	startRoutines();
	openWindow();
});
