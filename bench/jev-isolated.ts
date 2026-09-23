// Measures the Jev loop alone: its own Electron and fixture site, the real Jev by TYPESAFE_API_KEY, no main model and nothing from Mimo Dev.
import { join } from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { parseArgs } from "node:util"
import { z } from "zod"
import { browserActResult, type BrowserCommand, type BrowserRun } from "@src/shared/browser"
import { createJev } from "@src/engine/browser/jev"
import { runJevNavigation } from "@src/engine/browser/jev-navigation"
import { createSecrets } from "@src/shared/secrets"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { repetitions: { type: "string", default: "10" }, scenario: { type: "string" }, label: { type: "string", default: "atual" }, output: { type: "string" } } })

if (!values.output) {
  throw new Error("Use --output <arquivo.json> [--label nome] [--repetitions 10] [--scenario a,b]")
}

const output = values.output
const key = z.string().min(1, "Defina TYPESAFE_API_KEY").parse(process.env.TYPESAFE_API_KEY)
const repository = join(import.meta.dir, "..")
const directory = await mkdtemp(join(tmpdir(), "mimo-jev-isolated-"))
const build = Bun.spawn([process.execPath, "build", join(import.meta.dir, "jev-isolated-electron.ts"), "--target=node", "--external=electron", `--outfile=${join(directory, "harness.mjs")}`], { stdout: "ignore", stderr: "inherit" })

if (await build.exited) {
  throw new Error("Harness build failed")
}

const child = Bun.spawn([join(repository, "node_modules/.bin/electron"), `--ozone-platform=${process.env.WAYLAND_DISPLAY ? "wayland" : "x11"}`, join(directory, "harness.mjs"), directory, repository], { stdin: "pipe", stdout: "pipe", stderr: "ignore" })
const pending = new Map<string, ReturnType<typeof Promise.withResolvers<string>>>()
const ready = Promise.withResolvers<string>()
pending.set("ready", ready)
const reply = z.object({ id: z.string(), result: z.string().optional(), error: z.string().optional() })
void (async () => {
  let buffer = ""

  for await (const chunk of child.stdout) {
    buffer += new TextDecoder().decode(chunk)
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines.filter((entry) => entry.startsWith("{"))) {
      const message = reply.parse(JSON.parse(line))
      const wait = pending.get(message.id)
      pending.delete(message.id)

      if (message.error) {
        wait?.reject(new Error(message.error))
      } else {
        wait?.resolve(message.result ?? "")
      }
    }
  }
})()

async function command(request: { action: "execute"; input: BrowserCommand } | { action: "goto"; url: string } | { action: "evaluate"; expression: string } | { action: "stop" }) {
  const id = crypto.randomUUID()
  const result = Promise.withResolvers<string>()
  pending.set(id, result)
  void child.stdin.write(`${JSON.stringify({ id, ...request })}\n`)

  return await result.promise
}

const site = await ready.promise
const system = createObservationSystem({ appSessionId: "jev-isolated", logDirectory: join(directory, "logs"), development: false })
const database = openDatabase(":memory:", system.observability)
const jev = createJev({ database, secrets: createSecrets("cd".repeat(32)) })
const saved = await jev.save({ key })

if (!saved.ok) {
  throw new Error(`Jev key rejected: ${saved.reason}`)
}

// `paths` lists every address the scenario may pass through; an action that lands anywhere else counts as wrong.
interface Scenario { name: string; group: "principal" | "reservado"; url: string; objective: string; values: BrowserRun["values"]; done: BrowserRun["done"]; paths: string[] }

const scenarios: Scenario[] = [
  { name: "secao", group: "principal", url: `${site}inicio?order=1`, objective: "Abra Faturas e pare antes de qualquer pagamento", values: [], done: [{ kind: "url", value: "/faturas" }, { kind: "text", value: "Faturas fictícias" }], paths: ["/inicio", "/faturas"] },
  { name: "registro", group: "principal", url: `${site}inicio?order=2`, objective: "Localize a fatura de agosto de 2026, abra os detalhes e pare sem pagar", values: [], done: [{ kind: "url", value: "/agosto" }, { kind: "text", value: "Detalhes da fatura de agosto de 2026" }], paths: ["/inicio", "/faturas", "/agosto"] },
  { name: "painel", group: "principal", url: `${site}painel`, objective: "Abra o Relatório trimestral no painel", values: [], done: [{ kind: "url", value: "/relatorio" }, { kind: "text", value: "Relatório trimestral de 2026" }], paths: ["/painel", "/relatorio"] },
  { name: "catalogo-052", group: "principal", url: `${site}catalogo`, objective: "No catálogo, vá até o item Produto 052 e abra a página dele", values: [], done: [{ kind: "url", value: "/produto-052" }], paths: ["/catalogo", "/produto-052"] },
  { name: "formulario", group: "principal", url: `${site}inicio?order=0`, objective: "Abra Suporte e preencha somente Assunto com o valor fornecido, sem enviar", values: [{ name: "Assunto", text: "Consulta fictícia" }], done: [{ kind: "url", value: "/suporte" }, { kind: "field", name: "Assunto", value: "Consulta fictícia" }], paths: ["/inicio", "/suporte"] },
  { name: "dois-campos", group: "principal", url: `${site}suporte?assunto=Consulta%20fict%C3%ADcia`, objective: "Preencha Assunto e Mensagem com os valores fornecidos, sem enviar", values: [{ name: "Assunto", text: "Consulta fictícia" }, { name: "Mensagem", text: "Demonstração sem envio" }], done: [{ kind: "field", name: "Assunto", value: "Consulta fictícia" }, { kind: "field", name: "Mensagem", value: "Demonstração sem envio" }], paths: ["/suporte"] },
  { name: "pedidos", group: "principal", url: `${site}pedidos`, objective: "Encontre o pedido pendente de Marina Costa usando os filtros, abra o pedido e mostre a aba Entrega", values: [{ name: "Buscar cliente", text: "Marina" }], done: [{ kind: "url", value: "/pedido-4821" }, { kind: "text", value: "agendada para 12/10/2026" }], paths: ["/pedidos", "/pedido-4821"] },
  { name: "catalogo-437", group: "principal", url: `${site}catalogo`, objective: "Abra os detalhes do Produto 437 no catálogo", values: [], done: [{ kind: "url", value: "/produto-437" }, { kind: "text", value: "Detalhes do Produto 437" }], paths: ["/catalogo", "/produto-437"] },
  { name: "documentacao-referencia", group: "principal", url: "https://docs.typesafe.ai/models", objective: "Abra a página JavaScript SDK na documentação da TypeSafe", values: [], done: [{ kind: "url", value: "/sdk/javascript" }, { kind: "text", value: "JavaScript SDK" }], paths: ["/models", "/sdk/javascript"] },
  { name: "documentacao", group: "principal", url: "https://docs.typesafe.ai/", objective: "Encontre e abra a página JavaScript SDK na documentação da TypeSafe", values: [], done: [{ kind: "url", value: "/sdk/javascript" }, { kind: "text", value: "JavaScript SDK" }], paths: ["/", "/introduction", "/sdk/javascript"] },
  { name: "reservado-pedidos", group: "reservado", url: `${site}pedidos`, objective: "Mostre quando será a entrega do pedido pendente de Rafael Lima", values: [{ name: "Buscar cliente", text: "Rafael" }], done: [{ kind: "url", value: "/pedido-4830" }, { kind: "text", value: "agendada para 12/10/2026" }], paths: ["/pedidos", "/pedido-4830"] },
  { name: "reservado-mensagem", group: "reservado", url: `${site}inicio?order=2`, objective: "Vá ao formulário de suporte e escreva apenas a Mensagem, sem enviar", values: [{ name: "Mensagem", text: "Pedido de segunda via" }], done: [{ kind: "url", value: "/suporte" }, { kind: "field", name: "Mensagem", value: "Pedido de segunda via" }], paths: ["/inicio", "/suporte"] },
]

// Runs inside the page: reads each condition and any forbidden effect from the DOM itself.
function pageState(conditions: BrowserRun["done"]) {
  return {
    conditions: conditions.map((condition) => {
      if (condition.kind === "url") {
        return location.href.includes(condition.value)
      }

      if (condition.kind === "title") {
        return document.title.includes(condition.value)
      }

      if (condition.kind === "text") {
        return (document.body?.innerText ?? "").includes(condition.value)
      }

      return Array.from(document.querySelectorAll("input,textarea")).some((node) => (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) && (node.getAttribute("aria-label") || node.name) === condition.name && node.value === condition.value)
    }),
    forbidden: document.body?.dataset.paid === "true" || location.search.includes("Assunto=") || location.search.includes("Mensagem="),
    url: location.href,
  }
}

// The page itself confirms the conditions, independently of the driver's evidence; a payment or a submitted form is a forbidden effect.
async function verify(scenario: Scenario) {
  const expression = `(${pageState.toString()})(${JSON.stringify(scenario.done)})`
  const state = z.object({ conditions: z.array(z.boolean()), forbidden: z.boolean(), url: z.string() }).parse(JSON.parse(await command({ action: "evaluate", expression })))

  // The url condition matches a substring, so a page below the destination would pass it; the final address must also be on the declared path.
  return { verified: state.conditions.every(Boolean) && !state.forbidden && scenario.paths.includes(new URL(state.url).pathname), forbidden: state.forbidden, finalUrl: state.url }
}

const runResult = z.object({ status: z.string(), reason: z.string(), usage: z.object({ calls: z.number(), inputTokens: z.number(), outputTokens: z.number() }) })

async function attempt(scenario: Scenario) {
  await command({ action: "goto", url: `${site}?reset=${crypto.randomUUID()}` })
  const decisions: Record<string, { option: string; probability: number; description: unknown }[]>[] = []
  const actions: { step: unknown; outcome: string; path?: string; wrong: boolean }[] = []
  const startedAt = performance.now()
  const raw = await runJevNavigation("isolated", { action: "run", url: scenario.url, objective: scenario.objective, values: scenario.values, done: scenario.done }, new AbortController().signal, {
    // The three most probable options of every question, to study how probability spreads between similar actions.
    jev: {
      ...jev,
      session(signal) {
        const session = jev.session(signal)

        return {
          ...session,
          async decide(request) {
            const decision = await session.decide(request)
            decisions.push(Object.fromEntries(Object.entries(decision.answers).map(([name, answer]) => [name, Object.entries(answer.probabilities).toSorted(([, left], [, right]) => right - left).slice(0, 3).map(([option, probability]) => ({ option, probability, description: new Map(Object.entries(request.questions[name]?.criteria ?? {})).get(option) }))])))

            return decision
          },
        }
      },
    },
    observability: system.observability,
    async execute(input) {
      const result = await command({ action: "execute", input })

      if (input.action === "act") {
        const act = browserActResult.parse(JSON.parse(result))
        const path = act.applied ? new URL(act.observation.url).pathname : undefined
        actions.push({ step: input.step, outcome: act.applied ? act.effect : act.reason, ...(path ? { path } : {}), wrong: !!path && !scenario.paths.includes(path) })
      }

      return result
    },
    authorize: async () => ({ allowed: true }),
    progress: () => {},
  })
  const durationMs = Math.round(performance.now() - startedAt)
  const result = runResult.parse(JSON.parse(raw))
  const page = await verify(scenario)

  return {
    durationMs,
    status: result.status,
    reason: result.reason,
    ...page,
    falseCompletion: result.status === "completed" && !page.verified,
    wrongActions: actions.filter((action) => action.wrong).length,
    calls: result.usage.calls,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    decisions,
    actions,
  }
}

const median = (numbers: number[]) => numbers.toSorted((left, right) => left - right)[Math.floor((numbers.length - 1) / 2)] ?? 0
const selected = scenarios.filter((scenario) => !values.scenario || values.scenario.split(",").includes(scenario.name))
const results: ({ scenario: string; group: Scenario["group"]; repetition: number } & Awaited<ReturnType<typeof attempt>>)[] = []

try {
  for (let repetition = 1; repetition <= Number(values.repetitions); repetition += 1) {
    for (const scenario of selected) {
      const record = { scenario: scenario.name, group: scenario.group, repetition, ...await attempt(scenario) }
      results.push(record)
      await Bun.write(output, JSON.stringify({ label: values.label, jevModel: saved.verification.model, scenarios: selected, results }, null, 2))
      console.log(JSON.stringify({ scenario: record.scenario, repetition, verified: record.verified, status: record.status, reason: record.reason, durationMs: record.durationMs, calls: record.calls, wrong: record.wrongActions }))
    }
  }
} finally {
  await command({ action: "stop" }).catch(() => {})
  await Promise.race([child.exited, Bun.sleep(3000).then(() => child.kill())])
  await system.observability.flush()
  database.close()
  await rm(directory, { recursive: true, force: true })
}

console.table(selected.map((scenario) => {
  const runs = results.filter((result) => result.scenario === scenario.name)

  return {
    cenário: scenario.name,
    grupo: scenario.group,
    sucesso: `${runs.filter((run) => run.verified).length}/${runs.length}`,
    "mediana ms": median(runs.map((run) => run.durationMs)),
    chamadas: median(runs.map((run) => run.calls)),
    "ações erradas": runs.reduce((sum, run) => sum + run.wrongActions, 0),
    "conclusão falsa": runs.filter((run) => run.falseCompletion).length,
    proibido: runs.filter((run) => run.forbidden).length,
  }
}))
