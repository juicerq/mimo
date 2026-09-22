import { ipcMain, View, WebContentsView, type BrowserWindow } from "electron"
import { z } from "zod"
import { browserBounds, browserOpen, type BrowserFrameInput, type BrowserPreview, type BrowserRequest, type BrowserState } from "@src/shared/browser"
import { parse } from "@src/shared/parse"
import { BrowserPage } from "./browser-page"
import { importZenSession } from "./zen-session"

export class Browser {
  private readonly pages = new Map<string, BrowserPage>()
  private focusedBotId: string | null = null
  private readonly timer: ReturnType<typeof setInterval>
  private capturing = false
  private preparingSession?: ReturnType<typeof importZenSession>
  private readonly cover = new View()
  private readonly inputShield = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })

  constructor(private readonly window: BrowserWindow, private readonly remote: { publish(pages: BrowserPreview[]): void }) {
    this.cover.setBounds({ x: 0, y: 0, width: 1, height: 1 })
    this.cover.setBackgroundBlur(1)
    this.cover.setBackgroundColor("#0c0a09")
    this.inputShield.setBackgroundColor("#00000000")
    void this.inputShield.webContents.loadURL("data:text/html,<html><body style='margin:0;background:transparent;overflow:hidden'></body></html>")
    this.inputShield.webContents.on("before-input-event", (event, input) => {
      event.preventDefault()

      if (input.type === "keyDown" && input.key === "Escape") {
        this.minimize()
      }

      if (input.key === "Tab") {
        window.webContents.focus()
      }
    })
    window.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "Escape" && this.focusedBotId) {
        event.preventDefault()
        this.minimize()
      }
    })
    const handle = (name: string, action: (raw: unknown) => unknown) => {
      ipcMain.handle(`agent-browser:${name}`, (event, raw: unknown) => {
        if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
          throw new Error("Untrusted browser caller")
        }

        return action(raw)
      })
    }

    handle("open", async (raw) => {
      const input = parse(browserOpen, raw)
      const page = this.ensurePage(input)
      const opening = page.open(input.url)

      this.focus(input.botId)
      await opening
    })
    handle("state", () => this.state())
    handle("watch", (raw) => this.focus(parse(z.string(), raw)))
    handle("take-control", async (raw) => {
      const botId = parse(z.string(), raw)
      const page = this.page(botId)

      await page.takeControl()

      if (this.pages.get(botId) !== page) {
        return
      }

      this.focus(botId)
    })
    handle("bounds", (raw) => {
      const bounds = parse(browserBounds, raw)
      const page = this.focusedBotId ? this.pages.get(this.focusedBotId) : undefined

      if (page) {
        const [width, height] = window.getContentSize()

        if (bounds.x + bounds.width > width || bounds.y + bounds.height > height) {
          return
        }

        page.show(bounds)
        this.inputShield.setBounds(bounds)

        if (page.preview.control === "bot") {
          window.contentView.addChildView(this.inputShield)
        } else {
          window.contentView.removeChildView(this.inputShield)
        }

        window.contentView.addChildView(this.cover)
      }
    })
    handle("resume", (raw) => {
      const botId = parse(z.string(), raw)

      this.page(botId).resume()

      if (this.focusedBotId === botId) {
        window.contentView.addChildView(this.inputShield)
      }

      window.webContents.focus()
      this.publish()
    })
    handle("minimize", () => this.minimize())
    handle("close-popup", (raw) => this.page(parse(z.string(), raw)).closePopup())
    handle("close", (raw) => this.close(parse(z.string(), raw)))
    this.timer = setInterval(() => void this.capture(), 1000)
    window.on("closed", () => {
      clearInterval(this.timer)

      for (const page of this.pages.values()) {
        page.close()
      }

      this.pages.clear()
      this.inputShield.webContents.close()
    })
  }

  private page(botId: string) {
    const page = this.pages.get(botId)

    if (!page) {
      throw new Error("Browser page is closed")
    }

    return page
  }

  private state(): BrowserState {
    return { pages: [...this.pages.values()].map((page) => ({ ...page.preview })), focusedBotId: this.focusedBotId }
  }

  async frame(input: BrowserFrameInput) {
    return this.page(input.botId).nextFrame(input.after)
  }

  private focus(botId: string) {
    this.page(botId)

    for (const page of this.pages.values()) {
      if (page.preview.botId !== botId) {
        page.minimize()
      }
    }

    this.focusedBotId = botId
    this.publish()
  }

  private publish() {
    const destroyed = this.window.isDestroyed()

    if (destroyed) {
      return
    }

    const state = this.state()
    const focused = state.pages.find((page) => page.botId === state.focusedBotId)

    if (focused?.control === "bot") {
      this.window.contentView.addChildView(this.inputShield)
    } else {
      this.window.contentView.removeChildView(this.inputShield)
    }

    this.window.contentView.addChildView(this.cover)
    this.window.webContents.send("agent-browser:state", state)
    this.remote.publish(state.pages)
  }

  private async capture() {
    if (this.capturing) {
      return
    }

    this.capturing = true

    try {
      for (const page of this.pages.values()) {
        await Promise.race([page.capture(), new Promise<void>((resolve) => setTimeout(resolve, 2000))]).catch(() => {})
      }

      if (this.pages.size) {
        this.publish()
      }
    } finally {
      this.capturing = false
    }
  }

  async execute(request: BrowserRequest, signal: AbortSignal) {
    signal.throwIfAborted()

    if (request.input.action === "close") {
      const page = this.pages.get(request.botId)

      if (!page) {
        return "Browser page is already closed."
      }

      const result = await page.execute(request.input, signal)
      this.close(request.botId)

      return result
    }

    const requiresPage = ["take_control", "observe", "act"].includes(request.input.action)
    const page = requiresPage ? this.page(request.botId) : this.ensurePage(request)

    this.preparingSession ??= importZenSession(page.view.webContents.session.cookies).catch(() => {
      console.warn("Não foi possível importar as sessões do Zen. Confira MIMO_ZEN_PROFILE e MIMO_ZEN_CONTAINER; o navegador continua disponível.")
      return { imported: 0, skipped: 0 }
    })
    await this.preparingSession
    signal.throwIfAborted()

    return page.execute(request.input, signal)
  }

  private ensurePage(bot: { botId: string; botName: string }) {
    const existing = this.pages.get(bot.botId)

    if (existing) {
      return existing
    }

    const page = new BrowserPage({ window: this.window, cover: this.cover }, bot, () => this.publish())
    page.view.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "Escape" && page.preview.control === "user" && this.focusedBotId === bot.botId) {
        event.preventDefault()
        this.minimize()
      }
    })
    this.pages.set(bot.botId, page)
    this.publish()

    return page
  }

  private minimize() {
    this.window.contentView.removeChildView(this.inputShield)

    if (this.focusedBotId) {
      this.page(this.focusedBotId).minimize()
    }

    this.focusedBotId = null
    this.window.webContents.focus()
    this.publish()
  }

  private close(botId: string) {
    this.pages.get(botId)?.close()
    this.pages.delete(botId)

    if (this.focusedBotId === botId) {
      this.window.contentView.removeChildView(this.inputShield)
      this.focusedBotId = null
    }

    this.publish()
  }
}
