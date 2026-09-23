import { execFile } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { createHash } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { app, type WebContents } from "electron"
import { z } from "zod"
import type { BrowserAction, BrowserActResult, BrowserObservation, BrowserRun, BrowserStep } from "@src/shared/browser"
import { parse } from "@src/shared/parse"
import { inheritedEnvironment } from "@src/main/child-environment"
import { sanitizeUrl, snapshotCandidates } from "./browser-snapshot"

const runFile = promisify(execFile)
const response = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), data: z.unknown() }),
  z.object({ success: z.literal(false), error: z.string() }),
])
const batchResponse = z.array(z.object({ success: z.boolean(), result: z.unknown(), error: z.string().nullable() }))
const structuredSnapshot = z.object({ snapshot: z.string(), refs: z.record(z.string().regex(/^e[0-9]+$/), z.object({ role: z.string(), name: z.string() })).optional(), truncated: z.boolean().optional() })
const pageState = z.object({
  document: z.string(),
  mutations: z.int(),
  loading: z.boolean(),
  viewport: z.object({ width: z.number(), height: z.number() }),
  position: z.number(),
  frames: z.boolean(),
  evidence: z.array(z.boolean()),
  text: z.string(),
  scroll: z.object({ above: z.boolean(), below: z.boolean() }),
})
const guardWorld = 998

// Runs in the page's isolated world; it cannot reference anything outside its own body.
function readPage(input: { conditions: BrowserRun["done"]; full: boolean }) {
  const scope = globalThis as typeof globalThis & { mimoJevGuard?: { id: string; mutations: number } }

  if (!scope.mimoJevGuard) {
    const guard = { id: crypto.randomUUID(), mutations: 0 }
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.type !== "attributes" || !record.attributeName?.startsWith("data-__ab-"))) {
        guard.mutations++
      }
    })
    observer.observe(document, { childList: true, subtree: true, attributes: true, characterData: true })
    document.addEventListener("input", () => guard.mutations++, true)
    document.addEventListener("change", () => guard.mutations++, true)
    scope.mimoJevGuard = guard
  }

  const guard = scope.mimoJevGuard
  const root = document.scrollingElement ?? document.documentElement
  const containers = input.full ? Array.from(document.querySelectorAll("body *")).filter((element) => element.scrollHeight > element.clientHeight + 2 && element.clientHeight > 40 && /auto|scroll/.test(getComputedStyle(element).overflowY)) : []
  const scrollers = [root, ...containers]

  return {
    document: `${guard.id}:${location.href}`,
    mutations: guard.mutations,
    loading: document.readyState !== "complete",
    viewport: { width: innerWidth, height: innerHeight },
    position: scrollers.reduce((sum, element) => sum + element.scrollTop + element.scrollLeft, 0),
    frames: input.full && Array.from(document.querySelectorAll("iframe, frame")).some((frame) => frame.getClientRects().length > 0),
    evidence: input.conditions.map((condition) => {
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
    }),
    text: input.full ? ((document.querySelector("main") ?? document.body)?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 1200) : "",
    scroll: {
      above: scrollers.some((element) => element.scrollTop > 2),
      below: scrollers.some((element) => element.scrollTop + element.clientHeight < element.scrollHeight - 2),
    },
  }
}

export class BrowserDriver {
  private readonly session = `mimo-${process.pid}-${crypto.randomUUID()}`
  private connected = false
  private observed?: { observation: BrowserObservation; document: string; relevant: string; position: number }
  private commands = 0
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

  // Resolves with the CLI's JSON output, which also describes rejected commands such as a covered click target.
  private async invoke(args: string[], signal?: AbortSignal) {
    this.commands += 1
    const running = runFile(this.executable, ["--session", this.session, "--config", this.config, "--json", ...(this.address ? ["--cdp", this.address] : []), ...(this.connected ? ["--pin-tab"] : []), ...args], {
      timeout: 35_000,
      maxBuffer: 4_000_000,
      ...(signal ? { signal } : {}),
      env: { ...inheritedEnvironment(), HOME: app.getPath("home"), AGENT_BROWSER_DEFAULT_TIMEOUT: "20000", AGENT_BROWSER_MAX_OUTPUT: "300000", AGENT_BROWSER_CONTENT_BOUNDARIES: "1", AGENT_BROWSER_IDLE_TIMEOUT_MS: "300000" },
    }).then(({ stdout }) => stdout, async (error: NodeJS.ErrnoException & { stdout?: string }) => {
      const interrupted = signal?.aborted || Reflect.get(error, "killed")

      if (interrupted) {
        await this.interrupt()
      }

      if (!interrupted && error.stdout?.trim()) {
        return error.stdout
      }

      throw new Error(`The browser command failed (${error.code ?? error.name}). Take a fresh snapshot before deciding whether to retry.`)
    })
    this.active = running.catch(() => {})

    const output: unknown = JSON.parse(await running)

    return output
  }

  private async run(args: string[], signal?: AbortSignal) {
    const parsed = parse(response, await this.invoke(args, signal))

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

  // Every command runs in one CLI process, so reading several properties costs one spawn instead of one per property.
  private async batch(commands: string[][], signal: AbortSignal) {
    return parse(batchResponse, await this.invoke(["batch", ...commands.map((command) => command.join(" "))], signal))
  }

  private async page(full: boolean, conditions: BrowserRun["done"] = []) {
    return parse(pageState, await this.contents.executeJavaScriptInIsolatedWorld(guardWorld, [{ code: `(${readPage.toString()})(${JSON.stringify({ conditions, full })})` }]))
  }

  invalidate() {
    this.observed = undefined
  }

  private async capture(done: BrowserRun["done"], signal: AbortSignal, ready: () => Promise<void>, opening: { connectMs: number; openMs: number }) {
    const startedAt = performance.now()
    const commands = this.commands
    const before = await this.page(false)
    const raw = parse(structuredSnapshot, await this.run(["snapshot", "-c", "-u"], signal))
    const state = await this.page(true, done)
    await ready()
    const url = this.contents.getURL()
    const { candidates, omitted } = snapshotCandidates({ snapshot: raw.snapshot, refs: raw.refs ?? {} }, url)
    const pageUrl = sanitizeUrl(url, url)
    const title = this.contents.getTitle().slice(0, 300)
    // Refs are renumbered on every snapshot, so changes are compared by what the person would see: address, conditions and controls, not clocks or feeds.
    const relevant = createHash("sha256").update(JSON.stringify({ url, title, evidence: state.evidence, candidates: candidates.map(({ role, name, value, expanded, selected }) => [role, name, value, expanded, selected]) })).digest("hex")
    const observation = {
      id: crypto.randomUUID(),
      url: new URL(pageUrl, url).toString(),
      title,
      text: state.text,
      scroll: state.scroll,
      loading: state.loading || this.contents.isLoading(),
      candidates,
      omitted,
      valid: !state.frames && before.document === state.document && !!raw.refs && !raw.truncated,
      evidence: state.evidence,
      fingerprint: createHash("sha256").update(JSON.stringify({ relevant, position: Math.round(state.position) })).digest("hex"),
      timing: { ...opening, captureMs: Math.round(performance.now() - startedAt), commands: this.commands - commands },
    } satisfies BrowserObservation
    this.observed = { observation, document: state.document, relevant, position: state.position }

    return observation
  }

  async observe(input: { url?: string; done: BrowserRun["done"] }, signal: AbortSignal, ready: () => Promise<void>) {
    this.invalidate()
    const startedAt = performance.now()
    await this.connect(signal)
    await ready()
    const connectMs = Math.round(performance.now() - startedAt)

    if (input.url) {
      await this.run(["open", input.url], signal)
      await ready()
    }

    return JSON.stringify(await this.capture(input.done, signal, ready, { connectMs, openMs: Math.round(performance.now() - startedAt) - connectMs }))
  }

  // Validates only what the action depends on: the same document and a usable target. Unrelated updates elsewhere on the page do not block it.
  private async prepare(observed: NonNullable<BrowserDriver["observed"]>, step: BrowserStep, signal: AbortSignal): Promise<BrowserActResult | undefined> {
    const current = await this.page(false)

    if (current.document !== observed.document) {
      return { applied: false, reason: "page_changed" }
    }

    if (step.action !== "click" && step.action !== "fill") {
      return
    }

    const candidate = observed.observation.candidates.find((candidate) => candidate.ref === step.target)

    if (!candidate?.operations.includes(step.action)) {
      return { applied: false, reason: "outside_pilot" }
    }

    const inspected = await this.inspect(step.target, candidate.role === "link" ? ["href", "download"] : ["type"], { before: current, document: observed.document }, signal)

    if (!inspected.usable) {
      return { applied: false, reason: inspected.reason }
    }

    if (!await this.permits(step.action, candidate.role, inspected.values)) {
      return { applied: false, reason: "outside_pilot" }
    }
  }

  // Brings the target into view and reads its state in one CLI process. The ref stays bound to the observed element, so a replaced element reads as not visible.
  private async inspect(ref: string, attributes: string[], page: { before: z.infer<typeof pageState>; document: string }, signal: AbortSignal) {
    const results = await this.batch([["scrollintoview", ref], ["is", "visible", ref], ["is", "enabled", ref], ["get", "box", ref], ...attributes.map((name) => ["get", "attr", ref, name])], signal)

    if (results.some((result) => !result.success)) {
      return { usable: false, reason: "target_unusable" } as const
    }

    const [, visible, enabled, box, ...values] = results.map((result) => result.result)
    const after = await this.page(false)

    // Scrolling that also changed the page may have moved or replaced what was observed; decide again from a fresh observation.
    if (after.document !== page.document || (after.position !== page.before.position && after.mutations !== page.before.mutations)) {
      return { usable: false, reason: "page_changed" } as const
    }

    // A page the compositor stopped rendering reports an empty viewport; clicks there cannot reach anything.
    if (!after.viewport.width || !after.viewport.height) {
      return { usable: false, reason: "page_hidden" } as const
    }

    const area = parse(z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }), box)
    const center = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
    const inside = center.x >= 0 && center.y >= 0 && center.x <= after.viewport.width && center.y <= after.viewport.height

    if (!inside || !parse(z.object({ visible: z.boolean() }), visible).visible || !parse(z.object({ enabled: z.boolean() }), enabled).enabled) {
      return { usable: false, reason: "target_unusable" } as const
    }

    return { usable: true as const, values: values.map((value) => parse(z.object({ value: z.string().nullable() }), value).value) }
  }

  private async permits(action: "click" | "fill", role: string, [first, second]: (string | null | undefined)[]) {
    if (action === "fill") {
      return !first || ["text", "search", "email", "tel", "url"].includes(first)
    }

    if (role === "link") {
      return second === null && !!first && /^https?:$/.test(new URL(first, this.contents.getURL()).protocol)
    }

    if (first === "button") {
      return true
    }

    // Without a type a button submits its form, so it is only safe on a page without forms.
    return !first && parse(z.boolean(), await this.contents.executeJavaScriptInIsolatedWorld(guardWorld, [{ code: "document.forms.length === 0" }]))
  }

  // Waits for evidence of the action instead of a fixed delay, then for a short quiet period so the next observation sees a settled page.
  private async effect(before: z.infer<typeof pageState>, step: BrowserStep, signal: AbortSignal) {
    const read = async () => await Promise.race([this.page(false), delay(1_000, undefined, { signal }).then(() => undefined)]).catch(() => undefined)
    const changed = (state?: z.infer<typeof pageState>) => !state || state.document !== before.document || state.mutations !== before.mutations || state.position !== before.position || this.contents.isLoading()
    const deadline = performance.now() + (step.action === "wait" ? 1_000 : 1_500)
    let state = await read()

    while (!changed(state) && performance.now() < deadline) {
      await delay(25, undefined, { signal })
      state = await read()
    }

    const quietUntil = performance.now() + 600
    let last = state

    while (performance.now() < quietUntil) {
      await delay(80, undefined, { signal })
      const next = await read()

      if (!this.contents.isLoading() && next && last && next.document === last.document && next.mutations === last.mutations) {
        break
      }

      last = next
    }

    while (this.contents.isLoading() && performance.now() < deadline + 8_000) {
      await delay(50, undefined, { signal })
    }
  }

  // An action counts as effective only when what the observation shows changed; a clock or feed updating elsewhere is not an effect.
  private async outcome(step: BrowserStep, previous: NonNullable<BrowserDriver["observed"]>, done: BrowserRun["done"], signal: AbortSignal, ready: () => Promise<void>) {
    const deadline = performance.now() + 2_000
    let observation = await this.capture(done, signal, ready, { connectMs: 0, openMs: 0 })

    if (step.action === "wait") {
      return { observation, effective: true }
    }

    if (step.action === "fill") {
      const value = parse(z.object({ value: z.string() }), await this.run(["get", "value", step.target], signal)).value

      return { observation, effective: value === step.text }
    }

    const changed = () => step.action === "scroll" ? this.observed?.position !== previous.position : this.observed?.relevant !== previous.relevant

    // Some pages react after a request; look again briefly before calling the action ineffective.
    while (!changed() && performance.now() < deadline) {
      await delay(150, undefined, { signal })
      observation = await this.capture(done, signal, ready, { connectMs: 0, openMs: 0 })
    }

    return { observation, effective: changed() }
  }

  async act(input: { observationId: string; step: BrowserStep; done: BrowserRun["done"] }, signal: AbortSignal, ready: () => Promise<void>) {
    const observed = this.observed
    const { step } = input
    this.invalidate()
    await ready()
    const startedAt = performance.now()
    const commands = this.commands

    if (!observed || observed.observation.id !== input.observationId || !observed.observation.valid) {
      return JSON.stringify({ applied: false, reason: "page_changed" } satisfies BrowserActResult)
    }

    const rejected = await this.prepare(observed, step, signal)

    if (rejected) {
      return JSON.stringify(rejected)
    }

    await ready()
    signal.throwIfAborted()
    const before = await this.page(false)
    const executedAt = performance.now()

    if (before.document !== observed.document) {
      return JSON.stringify({ applied: false, reason: "page_changed" } satisfies BrowserActResult)
    }

    if (step.action === "click") {
      const clicked = await this.run(["click", step.target], signal).then(() => true, (error: Error) => {
        // agent-browser checks the click point before dispatching; a covered target was never clicked.
        if (/covered by/i.test(error.message)) {
          return false
        }

        throw error
      })

      if (!clicked) {
        return JSON.stringify({ applied: false, reason: "target_unusable" } satisfies BrowserActResult)
      }
    } else if (step.action === "fill") {
      await this.run(["fill", step.target, step.text], signal)
    } else if (step.action === "scroll") {
      await this.run(["scroll", step.direction, "600"], signal)
    }

    const effectAt = performance.now()
    await this.effect(before, step, signal)
    await ready()
    const { observation, effective } = await this.outcome(step, observed, input.done, signal, ready)
    const timing = { prepareMs: Math.round(executedAt - startedAt), executeMs: Math.round(effectAt - executedAt), effectMs: Math.round(performance.now() - effectAt), commands: this.commands - commands }

    return JSON.stringify({ applied: true, effect: effective ? "confirmed" : "none", timing, observation } satisfies BrowserActResult)
  }

  async execute(input: BrowserAction, signal: AbortSignal, ready: () => Promise<void>) {
    this.invalidate()
    await this.connect(signal)
    await ready()

    if (input.action === "navigate") {
      await this.run(["open", input.url], signal)
    } else if (input.action === "click") {
      // A click outside the viewport can report success without reaching the element.
      await this.batch([["scrollintoview", input.target], ["click", input.target]], signal).then((results) => {
        const failed = results.find((result) => !result.success)

        if (failed) {
          throw new Error(failed.error ?? "The browser click failed")
        }
      })
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
