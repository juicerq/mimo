import { access, stat } from "node:fs/promises"
import { constants } from "node:fs"
import { join } from "node:path"
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"
import { z } from "zod"
import { loopbackHttpUrl } from "../shared/engine-ipc"
import { resolveAppProfile } from "../shared/app-profile"
import { parse } from "../shared/parse"
import { turnNotification } from "../shared/turn-notification"
import { startAppUpdates } from "./app-update"
import { EngineProcess } from "./engine-process/engine-process"
import { Browser } from "./browser/browser"
import { browserDebuggingPort } from "./browser/browser-debugging"
import { createKeepAwake } from "./keep-awake"
import { createMobileAccess } from "./mobile-access"
import { actOnLocalFile, resolveLocalFile } from "./local-files"
import { loadSecret } from "./secret-file"
import { createTurnNotifications } from "./turn-notification"

const appProfile = resolveAppProfile({ packaged: app.isPackaged, loadProvider: process.env.MIMO_LOAD_PROVIDER === "true" })

// Uma única pasta de dados por máquina no dev, fora do checkout: worktrees e `bun run dev` abrem o mesmo banco do serviço.
if (process.env.MIMO_USER_DATA) {
  app.setPath("userData", process.env.MIMO_USER_DATA)
} else if (!app.isPackaged) {
  app.setPath("userData", join(app.getPath("appData"), "mimo-dev"))
}

app.setName(appProfile.name)

if (process.platform === "linux" && appProfile.desktopName) {
  app.setDesktopName(`${appProfile.desktopName}.desktop`)
  app.commandLine.appendSwitch("class", appProfile.desktopName)
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
}

const background = process.argv.includes("--background")
let showOnReady = !background
let mainWindow: BrowserWindow | undefined
let quitting = false

function showMainWindow() {
  if (!mainWindow) {
    return
  }

  // Wayland ignores restore() and focus() on a minimized or covered window; unmapping and mapping it again brings it to the front.
  mainWindow.hide()
  mainWindow.show()
  mainWindow.focus()
}

app.on("second-instance", (_event, argv) => {
  if (!argv.includes("--background")) {
    showOnReady = true
    showMainWindow()
  }
})
app.on("activate", showMainWindow)

// Alt+J on Linux: toggle-mimo.sh minimizes the active window through KWin and sends SIGUSR2 to show it otherwise.
if (process.platform !== "win32") {
  process.on("SIGUSR2", () => {
    showOnReady = true
    showMainWindow()
  })
}

const icon = join(app.getAppPath(), "resources", appProfile.icon)
const engineName = process.platform === "win32" ? "mimo-engine.exe" : "mimo-engine"
const executable = app.isPackaged
  ? join(process.resourcesPath, "engine", engineName)
  : join(app.getAppPath(), "dist-engine", engineName)
const rendererUrl = !app.isPackaged && process.env.ELECTRON_RENDERER_URL ? parse(loopbackHttpUrl, process.env.ELECTRON_RENDERER_URL) : undefined
let browser: Browser | undefined

const engine = new EngineProcess({
  browser: () => browser,
  executable,
  ...(app.isPackaged ? { rendererDirectory: join(process.resourcesPath, "renderer") } : {}),
  databasePath: join(app.getPath("userData"), "mimo.sqlite"),
  privateBotsDirectory: join(app.getPath("userData"), "bots"),
  secretKey: () => loadSecret(join(app.getPath("userData"), "secret.key")),
  ...(import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID ? { googleClient: { id: import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID, ...(import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ? { secret: import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET } : {}) } } : {}),
  githubRelayUrl: process.env.MIMO_GITHUB_RELAY_URL ?? "https://joltgithub.duckdns.org",
  appVersion: app.getVersion(),
  electronVersion: process.versions.electron,
  development: !app.isPackaged,
  loadProvider: appProfile.loadProvider,
  onUnexpectedExit(error) {
    console.error(error)
    app.exit(1)
  },
})

// Bot pages stay parked behind a cover while the person works elsewhere; an occluded page stops rendering and cannot be clicked.
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows")
app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1")
app.commandLine.appendSwitch("remote-debugging-port", await browserDebuggingPort(appProfile.debuggingPort))

void app.whenReady().then(async () => {
  const mobileAccess = createMobileAccess({ directory: app.getPath("userData"), engine, keepAwake: createKeepAwake(), ...(rendererUrl ? { rendererPort: Number(new URL(rendererUrl).port) } : {}) })
  const starting = mobileAccess.load().then((credentials) => engine.start(credentials))

  ipcMain.handle("engine:get-connection", () => starting.then(() => engine.connection))
  ipcMain.handle("mobile-access:get", () => mobileAccess.get())
  ipcMain.handle("mobile-access:configure", (_event, raw: unknown) => mobileAccess.configure(raw))
  ipcMain.handle("mobile-access:unpair", () => mobileAccess.unpair())
  void starting.then(() => mobileAccess.restore(), () => {})

  const window = new BrowserWindow({
    title: appProfile.title,
    width: 960,
    height: 760,
    frame: false,
    icon,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow = window
  window.on("page-title-updated", (event) => event.preventDefault())

  if (showOnReady) {
    window.maximize()
    showMainWindow()
  }

  window.on("close", (event) => {
    if (background && !quitting) {
      event.preventDefault()
      window.hide()
    }
  })
  browser = new Browser(window, { publish: (pages) => engine.publishBrowserPages(pages) })
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event) => event.preventDefault())
  const notifications = createTurnNotifications({
    window,
    icon,
    openConversation: (botId) => window.webContents.send("notification:open-conversation", botId),
  })

  ipcMain.handle("notification:turn-finished", (_event, raw: unknown) => notifications.show(parse(turnNotification, raw)))
  ipcMain.handle("window:minimize", () => window.minimize())
  ipcMain.handle("window:toggle-maximize", () => window.isMaximized() ? window.unmaximize() : window.maximize())
  ipcMain.handle("window:close", () => window.close())
  ipcMain.handle("browser:open", async (_event, rawUrl: unknown) => {
    const url = parse(z.url({ protocol: /^https$/ }), rawUrl)

    await shell.openExternal(url)
  })
  ipcMain.handle("file:action", (_event, raw: unknown) => actOnLocalFile(raw))
  ipcMain.handle("file:resolve", (_event, raw: unknown) => resolveLocalFile(raw))
  ipcMain.handle("working-directory:choose", async () => {
    const selection = await dialog.showOpenDialog(window, { properties: ["openDirectory", "createDirectory"] })
    const path = selection.filePaths.at(0)

    if (selection.canceled || !path) {
      return null
    }

    const info = await stat(path).catch(() => null)

    if (!info?.isDirectory()) {
      throw new Error("The selected working directory is invalid")
    }

    await access(path, constants.R_OK | constants.W_OK)

    return path
  })

  const loading = rendererUrl ? window.loadURL(rendererUrl) : window.loadFile(join(process.resourcesPath, "renderer", "index.html"))

  await starting
  await engine.event({ name: "main.started", attributes: { process: "main", status: "ready", version: app.getVersion() } })
  await loading

  await startAppUpdates({ window, engine })
}).catch(async (error) => {
  console.error(error)
  await engine.stop()
  app.exit(1)
})

let engineStopped = false

app.on("before-quit", (event) => {
  quitting = true

  if (engineStopped) {
    return
  }

  event.preventDefault()
  void engine.event({ name: "main.stopped", attributes: { process: "main", status: "stopping" } }).then(() => engine.stop()).then(() => {
    engineStopped = true
    app.quit()
  })
})
app.on("window-all-closed", () => app.quit())
