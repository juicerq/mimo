import { execFile } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { createHash } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { app, type WebContents } from "electron"
import { z } from "zod"
import type { BrowserAction, BrowserObservation, BrowserRun, BrowserStep } from "@src/shared/browser"
import { parse } from "@src/shared/parse"
import { inheritedEnvironment } from "@src/main/child-environment"

const runFile = promisify(execFile)
const response = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), data: z.unknown() }),
  z.object({ success: z.literal(false), error: z.string() }),
])
const structuredSnapshot = z.object({ snapshot: z.string(), refs: z.record(z.string().regex(/^e[0-9]+$/), z.object({ role: z.string(), name: z.string() })).optional(), truncated: z.boolean().optional() })
const guardWorld = 998
const sensitiveName = /password|senha|secret|segredo|token|api.?key|cart[aã]o|credit.card|cvv|otp|c[oó]digo.de.verifica/i
const riskyName = /pay|pagar|pagamento|comprar|purchase|buy|checkout|delete|excluir|apagar|remover|remove|enviar|submit|confirmar|confirm|transfer|download|baixar|upload|entrar|log.?in|sign.?in/i

export class BrowserDriver {
  private readonly session = `mimo-${process.pid}-${crypto.randomUUID()}`
  private connected = false
  private observed?: { observation: BrowserObservation; revision: string }
  private address?: string
  private pidFile?: string
  private active: Promise<unknown> = Promise.resolve()
  private readonly config = join(app.getPath("userData"), "browser-driver.json")
  private readonly executable = join(app.isPackaged ? process.resourcesPath : app.getAppPath(), app.isPackaged ? "browser-driver" : "node_modules/agent-browser/bin", `agent-browser-${process.platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`)

  constructor(private readonly contents: WebContents) {}

  private async interrupt() {
    this.connected = false
    this.invalidate()

    if (this.pidFile) {
      const saved = await readFile(this.pidFile, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") {
          throw error
        }
      })

      if (!saved) {
        return
      }

      const pid = parse(z.coerce.number().int().positive(), saved.trim())

      // Closing the CLI socket does not cancel a command already running in its daemon.
      try {
        process.kill(pid, "SIGKILL")
      } catch (error) {
        if (Reflect.get(Object(error), "code") !== "ESRCH") {
          throw error
        }
      }
    }
  }

  private async run(args: string[], signal?: AbortSignal) {
    const running = runFile(this.executable, ["--session", this.session, "--config", this.config, "--json", ...(this.address ? ["--cdp", this.address] : []), ...(this.connected ? ["--pin-tab"] : []), ...args], {
      timeout: 35_000,
      maxBuffer: 1_000_000,
      ...(signal ? { signal } : {}),
      env: { ...inheritedEnvironment(), HOME: app.getPath("home"), AGENT_BROWSER_DEFAULT_TIMEOUT: "20000", AGENT_BROWSER_MAX_OUTPUT: "30000", AGENT_BROWSER_CONTENT_BOUNDARIES: "1", AGENT_BROWSER_IDLE_TIMEOUT_MS: "300000" },
    }).catch(async (error: NodeJS.ErrnoException) => {
      if (signal?.aborted || Reflect.get(error, "killed")) {
        await this.interrupt()
      }

      throw new Error(`The browser command failed (${error.code ?? error.name}). Take a fresh snapshot before deciding whether to retry.`)
    })
    this.active = running.catch(() => {})
    const result = await running
    const parsed = parse(response, JSON.parse(result.stdout))

    if (!parsed.success) {
      throw new Error(parsed.error)
    }

    return parsed.data
  }

  private async connect(signal: AbortSignal) {
    if (this.connected) {
      return
    }

    await writeFile(this.config, "{}", { mode: 0o600 })

    if (!this.pidFile) {
      const result = await runFile(this.executable, ["--session", this.session, "--config", this.config, "--json", "session", "info"], {
        timeout: 2_000,
        env: { ...inheritedEnvironment(), HOME: app.getPath("home") },
      })
      const info = parse(z.object({ success: z.literal(true), data: z.object({ session: z.literal(this.session), active: z.literal(false), socketDir: z.string() }) }), JSON.parse(result.stdout))
      this.pidFile = join(info.data.socketDir, `${this.session}.pid`)
    }

    this.address = app.commandLine.getSwitchValue("remote-debugging-port")
    this.contents.debugger.attach("1.3")
    const target = await this.contents.debugger.sendCommand("Target.getTargetInfo").finally(() => this.contents.debugger.detach())
    const { targetInfo } = parse(z.object({ targetInfo: z.object({ targetId: z.string() }) }), target)

    await this.run(["tab", targetInfo.targetId], signal)
    await this.run(["--pin-tab", "snapshot", "-c"], signal)
    this.connected = true
  }

  private async revision() {
    return parse(z.string(), await this.contents.executeJavaScriptInIsolatedWorld(guardWorld, [{ code: `(() => {
      if (!globalThis.mimoJevGuard) {
        const guard = { id: crypto.randomUUID(), version: 0 };
        const observer = new MutationObserver((records) => {
          if (records.some((record) => record.type !== 'attributes' || !record.attributeName.startsWith('data-__ab-'))) { guard.version++; }
        });
        observer.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
        document.addEventListener('input', () => guard.version++, true);
        document.addEventListener('change', () => guard.version++, true);
        globalThis.mimoJevGuard = guard;
      }
      const guard = globalThis.mimoJevGuard;
      return guard.id + ':' + guard.version + ':' + location.href;
    })()` }]))
  }

  invalidate() {
    this.observed = undefined
  }

  async observe(done: BrowserRun["done"], signal: AbortSignal, ready: () => Promise<void>) {
    this.invalidate()
    await this.connect(signal)
    await ready()
    await delay(100, undefined, { signal })
    const before = await this.revision()
    const raw = parse(structuredSnapshot, await this.run(["snapshot", "-c"], signal))
    const hasFrames = parse(z.boolean(), await this.contents.executeJavaScriptInIsolatedWorld(guardWorld, [{ code: "Array.from(document.querySelectorAll('iframe, frame')).some((frame) => frame.getClientRects().length > 0)" }]))
    const evidence = parse(z.array(z.boolean()), await this.contents.executeJavaScriptInIsolatedWorld(guardWorld, [{ code: `(${(conditions: BrowserRun["done"]) => conditions.map((condition) => {
      if (condition.kind === "url") {
        return location.href.includes(condition.value)
      }
      if (condition.kind === "title") {
        return document.title.includes(condition.value)
      }
      if (condition.kind === "text") {
        return (document.body?.innerText ?? "").includes(condition.value)
      }
      return Array.from(document.querySelectorAll("input, textarea")).some((field) => {
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || field.type === "password") {
          return false
        }
        const name = field.getAttribute("aria-label") || Array.from(field.labels ?? []).map((label) => label.innerText).join(" ") || field.name
        return name === condition.name && field.value === condition.value
      })
    })})(${JSON.stringify(done)})` }]))
    const revision = await this.revision()
    await ready()
    const entries = Object.entries(raw.refs ?? {})
    const candidates = entries.filter(([, value]) => ["link", "button", "textbox", "searchbox", "combobox", "heading"].includes(value.role) && !sensitiveName.test(value.name)).map(([ref, value]) => ({ ref: `@${ref}`, ...value }))
    const url = new URL(this.contents.getURL())
    url.username = ""
    url.password = ""
    url.search = ""
    const title = this.contents.getTitle()
    const complete = !hasFrames && before === revision && !!raw.refs && !raw.truncated && raw.snapshot.length < 29_000 && candidates.length <= 80 && candidates.every((candidate) => candidate.name.length <= 300)
    const observation = { id: crypto.randomUUID(), url: url.toString(), title: title.slice(0, 300), candidates: candidates.slice(0, 80).map((candidate) => ({ ...candidate, name: candidate.name.slice(0, 300) })), complete, evidence, fingerprint: createHash("sha256").update(JSON.stringify({ url: url.toString(), title, candidates: candidates.map(({ role, name }) => ({ role, name })), evidence })).digest("hex") }
    this.observed = { observation, revision }

    return JSON.stringify(observation)
  }

  async act(observationId: string, step: BrowserStep, signal: AbortSignal, ready: () => Promise<void>) {
    const observed = this.observed
    this.invalidate()
    await ready()

    if (!observed || observed.observation.id !== observationId || !observed.observation.complete || observed.revision !== await this.revision()) {
      throw new Error("Browser observation changed. Observe and decide again; no action was applied.")
    }

    if (step.action === "click" || step.action === "fill") {
      const candidate = observed.observation.candidates.find((candidate) => candidate.ref === step.target)

      if (!candidate || sensitiveName.test(candidate.name) || riskyName.test(candidate.name)) {
        throw new Error("This target is outside the Jev pilot. Return control to the Bot.")
      }

      if (step.action === "fill") {
        const type = parse(z.object({ value: z.string().nullable() }), await this.run(["get", "attr", step.target, "type"], signal))

        if (![null, "text", "search", "email", "tel", "url"].includes(type.value)) {
          throw new Error("This field is outside the Jev pilot.")
        }
      } else if (!["link", "button"].includes(candidate.role)) {
        throw new Error("This target cannot be clicked by Jev.")
      }

      if (step.action === "click" && candidate.role === "button") {
        const type = parse(z.object({ value: z.string().nullable() }), await this.run(["get", "attr", step.target, "type"], signal))
        const outsideForms = type.value === null && parse(z.boolean(), await this.contents.executeJavaScriptInIsolatedWorld(guardWorld, [{ code: "document.forms.length === 0" }]))

        if (type.value !== "button" && !outsideForms) {
          throw new Error("Potential form submission is outside the Jev pilot.")
        }
      }

      if (step.action === "click" && candidate.role === "link") {
        const download = parse(z.object({ value: z.string().nullable() }), await this.run(["get", "attr", step.target, "download"], signal))
        const href = parse(z.object({ value: z.string().nullable() }), await this.run(["get", "attr", step.target, "href"], signal))

        if (download.value !== null || !href.value || !/^https?:$/.test(new URL(href.value, this.contents.getURL()).protocol)) {
          throw new Error("This link is outside the Jev pilot.")
        }
      }

      const visible = parse(z.object({ visible: z.boolean() }), await this.run(["is", "visible", step.target], signal))
      const enabled = parse(z.object({ enabled: z.boolean() }), await this.run(["is", "enabled", step.target], signal))

      if (!visible.visible || !enabled.enabled) {
        throw new Error("Browser target is not usable. Observe again.")
      }
    }

    await ready()
    signal.throwIfAborted()

    if (observed.revision !== await this.revision()) {
      throw new Error("Browser target changed before execution. Observe again.")
    }

    if (step.action === "wait") {
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new Error("Browser action interrupted")) }
        const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve() }, 500)
        signal.addEventListener("abort", abort, { once: true })
      })
    } else if (step.action === "click") {
      await this.run(["click", step.target], signal)
    } else if (step.action === "fill") {
      await this.run(["fill", step.target, step.text], signal)
    } else {
      await this.run(["scroll", step.direction, "600"], signal)
    }

    await delay(100, undefined, { signal })
    await ready()

    return "Action applied. A new observation is required to confirm its result."
  }

  async execute(input: BrowserAction, signal: AbortSignal, ready: () => Promise<void>) {
    this.invalidate()
    await this.connect(signal)
    await ready()

    if (input.action === "navigate") {
      await this.run(["open", input.url], signal)
    } else if (input.action === "click") {
      await this.run(["click", input.target], signal)
    } else if (input.action === "fill") {
      await this.run(["fill", input.target, input.text], signal)
    } else if (input.action === "press") {
      await this.run(["press", input.key], signal)
    } else if (input.action === "scroll") {
      await this.run(["scroll", input.direction, "600"], signal)
    }

    await ready()
    const snapshot = await this.run(["snapshot", "-c"], signal)

    const page = parse(z.object({ snapshot: z.string() }), snapshot)
    await ready()
    const body = parse(z.object({ text: z.string() }), await this.run(["get", "text", "body"], signal))

    return JSON.stringify({ url: this.contents.getURL(), text: body.text.slice(0, 24_000), snapshot: page.snapshot.slice(0, 30_000) })
  }

  async settle() {
    await this.active
  }

  async close() {
    await this.settle()

    if (this.connected) {
      await this.run(["close"]).catch((error: Error) => console.error("Browser driver shutdown failed", error.message))
    }
  }
}
