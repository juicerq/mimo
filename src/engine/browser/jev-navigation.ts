import { browserActResult, browserObservation, type BrowserActResult, type BrowserAction, type BrowserCommand, type BrowserObservation, type BrowserRun, type BrowserStep } from "@src/shared/browser"
import type { Observability } from "../observability/observability"
import type { createJev } from "./jev"
import { JevError } from "./jev-client"
import { boundJevFill, planJevDecision, readJevDecision, type JevHistoryEntry, type JevNext } from "./jev-decision"

const jevNavigationLimits = { actions: 12, durationMs: 60_000, noProgress: 3, recoveries: 2 }

interface Navigation {
  jev: ReturnType<typeof createJev>
  observability: Observability
  execute(input: BrowserCommand, signal: AbortSignal): Promise<string>
  authorize(step: BrowserStep | Extract<BrowserAction, { action: "navigate" }>, signal: AbortSignal): Promise<{ allowed: boolean }>
  progress(update: { label: string; detail: string; brief: string }): void
}

type Session = ReturnType<ReturnType<typeof createJev>["session"]>
type Status = "completed" | "blocked" | "cancelled" | "unavailable"

const statusLabels: Record<Status, string> = { completed: "Conclusão confirmada", blocked: "Controle devolvido ao Bot", cancelled: "Navegação interrompida", unavailable: "Jev indisponível" }

export async function runJevNavigation(botId: string, input: BrowserRun, callerSignal: AbortSignal, navigation: Navigation) {
  const runId = crypto.randomUUID()
  const context = { botId, runId }
  const startedAt = performance.now()
  const deadline = AbortSignal.timeout(jevNavigationLimits.durationMs)
  const labels: string[] = []
  const history: JevHistoryEntry[] = []
  const usage = { inputTokens: 0, outputTokens: 0, calls: 0, approvalMs: 0, observations: 0, discarded: 0, commands: 0, recoveries: 0 }
  const position: { previousFingerprint?: string; paging: boolean; stalled: number; offset: number; actions: number; recoveries: number } = { paging: false, stalled: 0, offset: 0, actions: 0, recoveries: 0 }
  let observed: BrowserObservation | undefined
  let lastAction: JevHistoryEntry | undefined
  let actionPending = false
  let activeSignal = callerSignal
  let model: string | undefined

  function progress(detail: string) {
    labels.push(detail)
    navigation.progress({ label: "Navegando com Jev", detail, brief: labels.join(" · ") })
  }

  function finish(status: Status, reason: string) {
    progress(statusLabels[status])
    navigation.observability.event({ name: "browser.jev.result", context, attributes: { status, reason, count: usage.calls, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, commands: usage.commands, recoveries: usage.recoveries, discarded: usage.discarded, ...(model ? { model } : {}) } })

    return JSON.stringify({
      status,
      reason,
      runId,
      model,
      usage,
      durationMs: Math.round(performance.now() - startedAt),
      lastConfirmedAction: lastAction ?? null,
      actionUncertain: actionPending,
      page: observed ? { url: observed.url, title: observed.title } : null,
      conditions: observed ? input.done.map((condition, index) => ({ ...condition, met: observed?.evidence[index] ?? false })) : null,
      recovery: "Continue from the current page. Observe before acting. Never replay an uncertain action or retry a denied action another way.",
    })
  }

  function record(observation: BrowserObservation) {
    usage.observations += 1
    usage.commands += observation.timing.commands
    navigation.observability.event({ name: "browser.jev.observation", context, attributes: { observationId: observation.id, count: observation.candidates.length, connectMs: observation.timing.connectMs, openMs: observation.timing.openMs, captureMs: observation.timing.captureMs, commands: observation.timing.commands, state: observation.valid ? "valid" : "invalid" } })

    return observation
  }

  async function observe(signal: AbortSignal, url?: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const observation = await navigation.observability.span({ name: "browser.jev.verify", context }, async () => record(browserObservation.parse(JSON.parse(await navigation.execute({ action: "observe", ...(attempt === 0 && url ? { url } : {}), done: input.done }, signal)))))

      if (observation.valid) {
        return observation
      }

      usage.discarded += 1
    }
  }

  async function open(signal: AbortSignal) {
    if (!input.url) {
      progress("Observando a página")
      observed = await observe(signal)
      return
    }

    const opening = await navigation.authorize({ action: "navigate", url: input.url }, signal)

    if (!opening.allowed) {
      return finish("blocked", "permission_denied")
    }

    progress("Abrindo a página")
    observed = await observe(signal, input.url)
  }

  // Progress compares what the page shows; paging through targets of the same page is not a stall.
  function limit(current: BrowserObservation) {
    if (position.actions >= jevNavigationLimits.actions) {
      return "action_limit"
    }

    if (position.previousFingerprint !== current.fingerprint) {
      position.offset = 0
      position.stalled = 0
    } else if (!position.paging) {
      position.stalled += 1
    }

    position.paging = false
    position.previousFingerprint = current.fingerprint

    if (position.stalled >= jevNavigationLimits.noProgress) {
      return "no_progress"
    }
  }

  async function decide(session: Session, plan: ReturnType<typeof planJevDecision>, current: BrowserObservation) {
    progress("Escolhendo a próxima ação")
    usage.calls += 1
    const decision = await navigation.observability.span({ name: "browser.jev.decide", context, attributes: { bytes: plan.bytes, count: plan.page.length } }, () => session.decide(plan.request))
    session.signal.throwIfAborted()
    model = decision.model
    usage.inputTokens += decision.usage.inputTokens
    usage.outputTokens += decision.usage.outputTokens
    const next = readJevDecision(decision.answers, plan)
    const action = decision.answers.action
    const target = next.kind === "act" && "target" in next.step ? decision.answers[`${next.step.action}_target`] : undefined
    navigation.observability.event({ name: "browser.jev.decision", context, attributes: { model, ...decision.usage, observationId: current.id, state: action?.choice ?? "none", percent: (action?.probabilities[action.choice] ?? 0) * 100, ...(target ? { target: target.choice, targetPercent: (target.probabilities[target.choice] ?? 0) * 100 } : {}) } })

    return next
  }

  async function recover(reason: Extract<BrowserActResult, { applied: false }>["reason"], signal: AbortSignal) {
    actionPending = false

    if (reason === "outside_pilot" || reason === "page_hidden") {
      return finish("blocked", reason)
    }

    // Nothing reached the page, so deciding again from a fresh observation cannot duplicate an action.
    position.recoveries += 1
    usage.recoveries += 1

    if (position.recoveries > jevNavigationLimits.recoveries) {
      return finish("blocked", reason)
    }

    observed = await observe(signal)
  }

  async function perform(next: Extract<JevNext, { kind: "act" }>, current: BrowserObservation, signal: AbortSignal) {
    const approvalStartedAt = performance.now()
    const authorization = await navigation.observability.span({ name: "browser.jev.authorize", context }, () => navigation.authorize(next.step, signal))
    usage.approvalMs += Math.round(performance.now() - approvalStartedAt)
    signal.throwIfAborted()

    if (!authorization.allowed) {
      return finish("blocked", "permission_denied")
    }

    const label = { click: `Abrir ${next.entry.target ?? "elemento"}`, fill: `Preencher ${next.entry.target ?? "campo"}`, scroll: "Rolar a página", wait: "Aguardar a página" }[next.step.action]
    progress(label)
    actionPending = true
    const result = await navigation.observability.span({ name: "browser.jev.execute", context, attributes: { observationId: current.id, ...("target" in next.step ? { target: next.step.target } : {}), state: next.step.action, count: position.actions + 1 } }, async () => browserActResult.parse(JSON.parse(await navigation.execute({ action: "act", observationId: current.id, step: next.step, done: input.done }, signal))))
    navigation.observability.event({ name: "browser.jev.action", context, attributes: { state: next.step.action, status: result.applied ? result.effect : result.reason, ...(result.applied ? result.timing : {}) } })

    if (!result.applied) {
      return await recover(result.reason, signal)
    }

    usage.commands += result.timing.commands
    observed = record(result.observation)

    // The command ran but nothing observable changed; repeating it could duplicate an effect the page has not shown yet.
    if (result.effect === "none") {
      return finish("blocked", "action_without_effect")
    }

    actionPending = false
    position.recoveries = 0
    position.actions += 1
    lastAction = next.entry
    history.push(next.entry)
    progress(`Ação: ${label}`)

    if (!observed.valid) {
      observed = await observe(signal)
    }
  }

  async function advance(session: Session) {
    session.signal.throwIfAborted()
    const current = observed

    if (!current) {
      return finish("blocked", "incomplete_observation")
    }

    if (current.evidence.length === input.done.length && current.evidence.every((value) => value)) {
      return finish("completed", "observed_conditions")
    }

    const reached = limit(current)

    if (reached) {
      return finish("blocked", reached)
    }

    const direct = boundJevFill(input, current)

    if (direct) {
      return await perform(direct, current, session.signal)
    }

    const plan = planJevDecision({ run: input, observation: current, history, model: model ?? "jev-latest", offset: position.offset })

    if (!plan.actionable) {
      return finish("blocked", "no_valid_target")
    }

    if (plan.oversized) {
      return finish("blocked", "context_limit")
    }

    const next = await decide(session, plan, current)

    if (next.kind === "stop") {
      return finish("blocked", next.reason)
    }

    if (next.kind === "page") {
      position.offset += plan.page.length
      position.paging = true
      return
    }

    return await perform(next, current, session.signal)
  }

  function interrupted(error: unknown) {
    if (callerSignal.aborted) {
      return finish("cancelled", "interrupted")
    }

    if (deadline.aborted) {
      return finish("blocked", "time_limit")
    }

    if (activeSignal.aborted) {
      return finish("cancelled", "credential_removed_or_interrupted")
    }

    if (error instanceof JevError) {
      return finish(error.reason === "cancelled" ? "cancelled" : "unavailable", error.reason)
    }

    return finish("blocked", actionPending ? "uncertain_result" : "page_changed_or_action_unconfirmed")
  }

  return await navigation.observability.span({ name: "browser.jev.run", context }, async () => {
    try {
      const session = navigation.jev.session(AbortSignal.any([callerSignal, deadline]))
      activeSignal = session.signal
      model = session.model
      let outcome = await open(session.signal)

      while (!outcome) {
        outcome = await advance(session)
      }

      return outcome
    } catch (error) {
      return interrupted(error)
    }
  })
}
