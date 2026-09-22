import { WebContentsView, type BrowserWindow, type BrowserWindowConstructorOptions, type View, type WebContents } from "electron"
import type { BrowserCommand, BrowserBounds, BrowserFrame, BrowserPreview } from "@src/shared/browser"
import { BrowserDriver } from "./browser-driver"

const webPreferences = { partition: "persist:mimo-browser", sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
const pageSize = { width: 1280, height: 800 }
const frameWaitMs = 700
const frameRetryMs = 150
const frameQuality = 75
const watchFrameWidth = 1280
const parkedBounds = { x: 1 - pageSize.width, y: 1 - pageSize.height, ...pageSize }
const httpUrl = /^https?:\/\//

function blockNonHttp(event: { preventDefault(): void }, url: string) {
  if (!httpUrl.test(url)) {
    event.preventDefault()
  }
}

export class BrowserPage {
  private readonly driver: BrowserDriver
  private shown = false
  private frame?: BrowserFrame
  private capturing?: Promise<Omit<BrowserFrame, "seq"> | null>
  readonly view: WebContentsView
  readonly preview: BrowserPreview
  private waiters = new Set<() => void>()
  private closed = false
  private controlRevision = 0
  private readonly lifetime = new AbortController()
  private running?: { controller: AbortController; done: Promise<void>; jev: boolean }
  private opening = false
  private requestingControl = false
  private popup?: WebContentsView

  constructor(private readonly host: { window: BrowserWindow; cover: View }, bot: { botId: string; botName: string }, private readonly changed: () => void) {
    this.preview = { botId: bot.botId, botName: bot.botName, url: "about:blank", title: "Navegador", control: "bot", openedBy: "bot", popup: false, reason: null, image: null, error: null }
    this.view = new WebContentsView({ webPreferences })
    this.driver = new BrowserDriver(this.view.webContents)
    this.view.setBounds(parkedBounds)
    this.attach(this.view)
    const contents = this.view.webContents

    contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    contents.session.setPermissionCheckHandler(() => false)
    contents.setWindowOpenHandler(({ url }) => {
      if (!httpUrl.test(url) || this.popup) {
        return { action: "deny" }
      }

      return { action: "allow", overrideBrowserWindowOptions: { webPreferences }, createWindow: (options) => this.openPopup(options) }
    })
    this.observe(contents)
    void contents.loadURL("about:blank")
  }

  private attach(view: View) {
    this.host.window.contentView.addChildView(view)
    this.host.window.contentView.addChildView(this.host.cover)
  }

  private observe(contents: WebContents) {
    contents.on("will-navigate", blockNonHttp)
    contents.on("will-redirect", blockNonHttp)
    contents.on("did-navigate", () => { this.driver.invalidate(); this.update() })
    contents.on("did-navigate-in-page", () => { this.driver.invalidate(); this.update() })
    contents.on("page-title-updated", () => this.update())
    contents.on("focus", () => {
      if (!this.shown || this.preview.control === "bot") {
        this.host.window.webContents.focus()
      }
    })
    contents.on("did-fail-load", (_event, code, description, _url, mainFrame) => {
      if (mainFrame && code !== -3) {
        this.fail(description)
      }
    })
    contents.on("render-process-gone", () => {
      this.fail("A página parou de responder. Feche o navegador e tente novamente.")

      if (contents === this.popup?.webContents) {
        this.closePopup()
      } else {
        this.close()
      }
    })
  }

  private openPopup(options: BrowserWindowConstructorOptions) {
    const popup = new WebContentsView(options)
    this.popup = popup
    this.preview.popup = true
    this.preview.image = null
    popup.setBounds(this.view.getBounds())
    popup.setVisible(this.preview.control === "user")
    this.attach(popup)
    popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    this.observe(popup.webContents)
    popup.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        event.preventDefault()
        this.host.window.webContents.focus()
        this.host.window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" })
      }
    })
    popup.webContents.once("destroyed", () => {
      const windowDestroyed = this.host.window.isDestroyed()

      if (!windowDestroyed) {
        this.host.window.contentView.removeChildView(popup)
      }

      this.popup = undefined
      this.preview.popup = false
      this.preview.image = null

      if (!this.closed) {
        this.update()

        if (this.shown) {
          this.view.webContents.focus()
        }
      }
    })

    if (this.preview.control === "bot") {
      void this.takeControl("Conclua a interação do site e devolva o controle quando terminar.")
    } else {
      this.changed()
      popup.webContents.focus()
    }

    return popup.webContents
  }

  closePopup() {
    this.popup?.webContents.close()
  }

  private get activeView() {
    return this.popup ?? this.view
  }

  private update() {
    this.preview.url = this.activeView.webContents.getURL()
    this.preview.title = this.activeView.webContents.getTitle() || "Navegador"
    this.changed()
  }

  private fail(message: string) {
    this.preview.error = message
    this.changed()
  }

  async open(url: string) {
    if (this.opening) {
      throw new Error("A página já está abrindo. Tente novamente.")
    }

    this.opening = true

    try {
      this.running?.controller.abort(new Error("The person opened a link. Read the current page before continuing."))
      await this.running?.done
      await this.takeControl()
      this.lifetime.signal.throwIfAborted()
      this.closePopup()
      this.preview.openedBy = "user"
      this.preview.reason = null
      this.preview.error = null
      await this.view.webContents.loadURL(url)
    } finally {
      this.opening = false
    }
  }

  async takeControl(reason?: string) {
    this.controlRevision += 1
    this.driver.invalidate()

    if (this.running?.jev) {
      this.running.controller.abort(new Error("The person took browser control"))
    }
    this.requestingControl = true
    await this.driver.settle()

    if (this.closed) {
      return
    }

    this.requestingControl = false
    this.preview.control = "user"
    this.popup?.setVisible(true)

    if (reason) {
      this.preview.reason = reason
    }

    this.changed()

    if (this.shown) {
      this.activeView.webContents.focus()
    }
  }

  show(bounds: BrowserBounds) {
    if (!this.shown) {
      this.shown = true
      this.attach(this.view)

      if (this.popup) {
        this.attach(this.popup)
      }
    }

    this.view.setBounds(bounds)
    this.popup?.setBounds(bounds)

    if (this.preview.control === "user") {
      this.activeView.webContents.focus()
    }
  }

  minimize() {
    if (!this.shown) {
      return
    }

    this.shown = false
    this.view.setBounds(parkedBounds)
    this.popup?.setBounds(parkedBounds)
  }

  resume() {
    if (this.closed || this.requestingControl || this.opening) {
      throw new Error("The browser is changing control or closed. Try again when it is ready.")
    }

    if (this.popup) {
      throw new Error("Close the site popup before returning browser control")
    }

    this.controlRevision += 1
    this.preview.control = "bot"
    this.preview.reason = null

    for (const resolve of this.waiters) {
      resolve()
    }

    this.changed()
  }

  async nextFrame(after: number) {
    const deadline = performance.now() + frameWaitMs

    while (!this.closed) {
      if (this.frame && this.frame.seq > after) {
        return this.frame
      }

      this.capturing ??= this.captureFrame().finally(() => {
        this.capturing = undefined
      })
      const captured = await this.capturing

      if (captured && captured.image !== this.frame?.image) {
        this.frame = { seq: (this.frame?.seq ?? 0) + 1, ...captured }
      }

      if (this.frame && this.frame.seq > after) {
        return this.frame
      }

      if (performance.now() >= deadline) {
        return null
      }
    }

    return null
  }

  private async captureFrame(): Promise<Omit<BrowserFrame, "seq"> | null> {
    await new Promise((resolve) => setTimeout(resolve, frameRetryMs))

    if (this.closed) {
      return null
    }

    const view = this.activeView
    const image = await view.webContents.capturePage(undefined, { stayHidden: true })

    if (this.closed || view !== this.activeView || image.isEmpty()) {
      return null
    }

    const { width, height } = view.getBounds()

    return { width, height, image: image.resize({ width: Math.min(width, watchFrameWidth) }).toJPEG(frameQuality).toString("base64") }
  }

  private async waitForControl(signal: AbortSignal) {
    signal.throwIfAborted()

    if ((this.requestingControl || this.preview.control === "user") && !this.closed) {
      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          this.waiters.delete(finish)
          signal.removeEventListener("abort", abort)
          resolve()
        }
        const abort = () => {
          this.waiters.delete(finish)
          reject(new Error("Browser action interrupted"))
        }

        this.waiters.add(finish)
        signal.addEventListener("abort", abort, { once: true })
      })
    }

    signal.throwIfAborted()

    if (this.closed) {
      throw new Error("The person closed the browser")
    }
  }

  async execute(input: BrowserCommand, callerSignal: AbortSignal) {
    if (this.running || this.opening) {
      throw new Error("A browser action is already running for this Bot")
    }

    const controller = new AbortController()
    const signal = AbortSignal.any([callerSignal, this.lifetime.signal, controller.signal])
    const { promise: done, resolve: finish } = Promise.withResolvers<void>()
    const jev = input.action === "observe" || input.action === "act"
    this.running = { controller, done, jev }

    try {
      signal.throwIfAborted()

      if (input.action === "take_control") {
        this.resume()
      }

      const revision = this.controlRevision

      if (jev && (this.preview.control !== "bot" || this.requestingControl)) {
        throw new Error("The person controls this page. Jev was interrupted.")
      }

      await this.waitForControl(signal)
      this.preview.error = null

      if (input.action === "handoff") {
        await this.takeControl(input.reason)
        await this.waitForControl(signal)
        return "The person returned browser control. Take a fresh snapshot before continuing."
      }

      const ready = async () => {
        if (jev && (revision !== this.controlRevision || this.preview.control !== "bot" || this.requestingControl)) {
          throw new Error("Browser control changed. Jev was interrupted.")
        }
        await this.waitForControl(signal)

        if (revision !== this.controlRevision && input.action !== "snapshot" && input.action !== "take_control") {
          throw new Error("The person used the browser. Do not repeat the previous action; take a fresh snapshot before continuing.")
        }
      }
      await ready()

      if (input.action === "observe") {
        return await this.driver.observe(input.done, signal, ready)
      }

      if (input.action === "act") {
        return await this.driver.act(input.observationId, input.step, signal, ready)
      }

      if (input.action === "close") {
        return "Browser page closed. Site sessions are saved."
      }

      const result = await this.driver.execute(input, signal, ready)
      await this.waitForControl(signal)

      return result
    } catch (error) {
      if (!signal.aborted) {
        this.fail("Não foi possível concluir a ação. Você pode assumir o navegador.")
      }

      throw error
    } finally {
      this.running = undefined
      finish()
      this.changed()
    }
  }

  async capture() {
    if (this.closed) {
      return
    }

    const view = this.activeView
    const { width, height } = view.getBounds()
    const image = await view.webContents.capturePage({ x: 0, y: 0, width, height }, { stayHidden: true })
    const empty = image.isEmpty()

    if (!this.closed && view === this.activeView && !empty) {
      this.preview.image = image.resize({ width: 320 }).toDataURL()
    }
  }

  close() {
    if (this.closed) {
      return
    }

    this.closed = true

    this.closePopup()

    this.lifetime.abort()
    void this.driver.close()

    for (const resolve of this.waiters) {
      resolve()
    }

    const windowDestroyed = this.host.window.isDestroyed()

    if (!windowDestroyed) {
      this.host.window.contentView.removeChildView(this.view)
    }

    const destroyed = this.view.webContents.isDestroyed()

    if (!destroyed) {
      this.view.webContents.close()
    }
  }
}
