import { join } from "node:path";
import { installBrowser } from "@agent/browser/registry";
import { startRoutines } from "@agent/routines/dispatcher";
import { loadEnv } from "@agent/storage/home";
import { RPCHandler } from "@orpc/server/message-port";
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from "electron";
import { PageView } from "./browser/view";
import { claimPictures, servePictures } from "./pictures";
import { router } from "./router";

loadEnv();
app.setDesktopName("mimo.desktop");

if (process.env.XDG_SESSION_TYPE === "wayland") {
	app.commandLine.appendSwitch("disable-gpu-compositing");
}

claimPictures();

const handler = new RPCHandler(router);

ipcMain.on("rpc", (event) => {
	const window = BrowserWindow.fromWebContents(event.sender);
	if (!window) {
		throw new Error("The rpc port came from outside a window.");
	}
	for (const port of event.ports) {
		handler.upgrade(port, { context: { window } });
		port.start();
	}
});

function openWindow(): void {
	const window = new BrowserWindow({
		width: 1100,
		height: 720,
		minWidth: 720,
		minHeight: 400,
		frame: false,
		title: "mimo",
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
		webPreferences: { preload: join(import.meta.dirname, "../preload/index.cjs") },
	});
	installBrowser(() => new PageView(window));
	window.webContents.on("will-navigate", (event) => event.preventDefault());
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//u.test(url)) {
			void shell.openExternal(url);
		}
		return { action: "deny" };
	});
	const devServer = process.env.ELECTRON_RENDERER_URL;
	if (devServer) {
		void window.loadURL(devServer);
		return;
	}
	void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}

app.on("window-all-closed", () => app.quit());

app.on("ready", () => {
	servePictures();
	void startRoutines();
	openWindow();
});
