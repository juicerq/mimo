import { parseArgs } from "node:util"
import { join } from "node:path"
import { homedir } from "node:os"
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ContractRouterClient } from "@orpc/contract"
import { z } from "zod"
import type { engineContract } from "@src/shared/engine-contract"
import type { BrowserRun } from "@src/shared/browser"
import { observation, type Observation } from "@src/shared/observability/observation"
import { connectCdp } from "./cdp"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { bot: { type: "string" }, port: { type: "string", default: "9222" }, repetitions: { type: "string", default: "5" }, scenario: { type: "string" }, modes: { type: "string", default: "convencional,jev" }, reserved: { type: "boolean", default: false }, output: { type: "string" } } })

if (!values.bot || !values.output) {
  throw new Error("Use --bot <Bot piloto no Mimo Dev> --output <arquivo.json> [--scenario a,b] [--modes convencional,jev,produto] [--reserved]")
}

const botId = values.bot
const output = values.output
const cdp = await connectCdp(values.port)
const connection = await cdp.evaluate("window.desktop.getEngineConnection()", z.object({ url: z.string(), token: z.string() }))
cdp.close()
const client: ContractRouterClient<typeof engineContract> = createORPCClient(new RPCLink({ url: connection.url, headers: { authorization: `Bearer ${connection.token}` } }))
const bot = await client.bots.get({ id: botId })

if (bot.name !== "Piloto Jev" || bot.permissionMode !== "full") {
  throw new Error("Este benchmark exige o Bot Piloto Jev em Acesso total no Mimo Dev")
}

const configured = await client.jev.status()

if (!configured.verification) {
  throw new Error("Verifique a chave Jev na interface antes de medir")
}

const site = "http://127.0.0.1:41920/"

interface Scenario {
  name: string
  group: "principal" | "reservado"
  url: string
  objective: string
  values: BrowserRun["values"]
  done: BrowserRun["done"]
}

const scenarios: Scenario[] = [
  { name: "secao", group: "principal", url: `${site}?order=1`, objective: "Abra Faturas e pare antes de qualquer pagamento", values: [], done: [{ kind: "url", value: "#faturas" }, { kind: "text", value: "Faturas fictícias" }] },
  { name: "registro", group: "principal", url: `${site}?order=2`, objective: "Localize a fatura de agosto de 2026, abra os detalhes e pare sem pagar", values: [], done: [{ kind: "url", value: "#agosto" }, { kind: "text", value: "Detalhes da fatura de agosto de 2026" }] },
  { name: "formulario", group: "principal", url: `${site}?order=0`, objective: "Abra Suporte e preencha somente Assunto com o valor fornecido, sem enviar", values: [{ name: "Assunto", text: "Consulta fictícia" }], done: [{ kind: "url", value: "#suporte" }, { kind: "field", name: "Assunto", value: "Consulta fictícia" }] },
  { name: "documentacao", group: "principal", url: "https://docs.typesafe.ai/", objective: "Encontre e abra a página JavaScript SDK na documentação da TypeSafe", values: [], done: [{ kind: "url", value: "/sdk/javascript" }, { kind: "text", value: "JavaScript SDK" }] },
  { name: "documentacao-referencia", group: "principal", url: "https://docs.typesafe.ai/models", objective: "Abra a página JavaScript SDK na documentação da TypeSafe", values: [], done: [{ kind: "url", value: "/sdk/javascript" }, { kind: "text", value: "JavaScript SDK" }] },
  { name: "dois-campos", group: "principal", url: `${site}?assunto=Consulta%20fict%C3%ADcia#suporte`, objective: "Preencha Assunto e Mensagem com os valores fornecidos, sem enviar", values: [{ name: "Assunto", text: "Consulta fictícia" }, { name: "Mensagem", text: "Demonstração sem envio" }], done: [{ kind: "field", name: "Assunto", value: "Consulta fictícia" }, { kind: "field", name: "Mensagem", value: "Demonstração sem envio" }] },
  { name: "catalogo", group: "principal", url: `${site}#catalogo`, objective: "Abra os detalhes do Produto 437 no catálogo", values: [], done: [{ kind: "url", value: "#produto-437" }, { kind: "text", value: "Detalhes do Produto 437" }] },
  { name: "pedidos", group: "principal", url: `${site}#pedidos`, objective: "Encontre o pedido pendente de Marina Costa usando os filtros, abra o pedido e mostre a aba Entrega", values: [{ name: "Buscar cliente", text: "Marina" }], done: [{ kind: "url", value: "#pedido-4821" }, { kind: "text", value: "agendada para 12/10/2026" }] },
  { name: "painel", group: "principal", url: `${site}#painel`, objective: "Abra o Relatório trimestral no painel", values: [], done: [{ kind: "url", value: "#relatorio" }, { kind: "text", value: "Relatório trimestral de 2026" }] },
  { name: "reservado-catalogo", group: "reservado", url: `${site}#catalogo`, objective: "No catálogo, vá até o item Produto 052 e abra a página dele", values: [], done: [{ kind: "url", value: "#produto-052" }] },
  { name: "reservado-pedidos", group: "reservado", url: `${site}#pedidos`, objective: "Mostre quando será a entrega do pedido pendente de Rafael Lima", values: [{ name: "Buscar cliente", text: "Rafael" }], done: [{ kind: "url", value: "#pedido-4830" }, { kind: "text", value: "agendada para 12/10/2026" }] },
  { name: "reservado-mensagem", group: "reservado", url: `${site}?order=2`, objective: "Vá ao formulário de suporte e escreva apenas a Mensagem, sem enviar", values: [{ name: "Mensagem", text: "Pedido de segunda via" }], done: [{ kind: "url", value: "#suporte" }, { kind: "field", name: "Mensagem", value: "Pedido de segunda via" }] },
]

const targetList = z.array(z.object({ id: z.string(), type: z.string(), url: z.string(), webSocketDebuggerUrl: z.string() }))
let pinnedTarget: string | undefined

async function evaluateOn(target: z.infer<typeof targetList>[number], expression: string) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error("CDP unavailable"))
  })

  try {
    return await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP evaluation timed out")), 5000)
      socket.onmessage = (event) => {
        const response = z.object({ id: z.number(), result: z.object({ result: z.object({ value: z.unknown().optional() }) }).optional() }).safeParse(JSON.parse(String(event.data)))

        if (response.success && response.data.id === 1) {
          clearTimeout(timeout)
          resolve(response.data.result?.result.value)
        }
      }
      socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }))
    })
  } finally {
    socket.close()
  }
}

// The Bot's page is identified by the URL Mimo reports for this Bot and then pinned by its CDP target id, so another page on the same site never counts.
async function botTarget() {
  const targets = targetList.parse(await (await fetch(`http://127.0.0.1:${values.port}/json`)).json()).filter((target) => target.type === "page")

  if (pinnedTarget) {
    return targets.find((target) => target.id === pinnedTarget)
  }

  const control = new AbortController()
  const stream = await client.browser.pages(undefined, { signal: control.signal })
  const first = await stream[Symbol.asyncIterator]().next()
  control.abort()
  const page = z.object({ pages: z.array(z.object({ botId: z.string(), url: z.string() })) }).parse(first.value).pages.find((entry) => entry.botId === botId)
  const matches = targets.filter((target) => page && target.url === page.url)

  if (matches.length !== 1) {
    return
  }

  pinnedTarget = matches[0]?.id

  return matches[0]
}

// A Bot page the compositor is not rendering has an empty viewport and fails in every mode, so such attempts measure the desktop, not the navigation.
async function reset() {
  const target = await botTarget()

  if (!target) {
    return true
  }

  await evaluateOn(target, "location.replace('about:blank')")

  for (let waited = 0; waited < 60_000; waited += 1000) {
    await Bun.sleep(1000)

    if (z.number().parse(await evaluateOn(target, "innerWidth")) > 0) {
      return true
    }
  }

  return false
}

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

async function verify(scenario: Scenario) {
  const target = await botTarget()

  if (!target) {
    return { verified: false, detail: "target_not_found" }
  }

  const expression = `(${pageState.toString()})(${JSON.stringify(scenario.done)})`
  const state = z.object({ conditions: z.array(z.boolean()), forbidden: z.boolean(), url: z.string() }).parse(await evaluateOn(target, expression))

  return { verified: state.conditions.every(Boolean) && !state.forbidden, detail: state.forbidden ? "forbidden_effect" : state.conditions.join(","), finalUrl: state.url }
}

function prompt(scenario: Scenario, mode: string, repetition: number) {
  const run = { action: "run", url: scenario.url, objective: scenario.objective, values: scenario.values, done: scenario.done }
  const navigation = {
    jev: `Chame a ferramenta browser UMA vez com ${JSON.stringify(run)}. A chamada abre a página sozinha. Se run devolver blocked, unavailable ou cancelled, pare e relate o resultado sem fallback convencional.`,
    convencional: `Navegue para ${scenario.url} e conclua com ações convencionais da ferramenta browser (snapshot, click, fill, scroll), usando referências observadas. NÃO use action run. Objetivo: ${scenario.objective}. Valores: ${JSON.stringify(scenario.values)}. Confira estas condições: ${JSON.stringify(scenario.done)}.`,
    produto: `Objetivo: ${scenario.objective}. Comece em ${scenario.url}. Valores: ${JSON.stringify(scenario.values)}. Condições observáveis de conclusão: ${JSON.stringify(scenario.done)}. Escolha como usar o navegador.`,
  }[mode]

  return `Experimento ${scenario.name}, ${mode}, repetição ${repetition}. Use somente browser e send_message, sem shell, ferramentas de arquivos nem delegação a outros Bots. ${navigation} Não compre, pague, exclua, envie formulários nem faça login. Mantenha a página aberta. Na resposta final diga apenas o status e a evidência observada.`
}

async function readObservations(startedAt: number) {
  const path = join(homedir(), ".config/mimo-dev/logs/observations.jsonl")
  // The log may end with a line still being written.
  const entries = (await Bun.file(path).text()).trim().split("\n").flatMap((line) => {
    try {
      const entry: unknown = JSON.parse(line)

      return [entry]
    } catch {
      return []
    }
  })

  return entries.flatMap((entry) => {
    const parsed = observation.safeParse(entry)

    if (!parsed.success || parsed.data.botId !== botId || Date.parse(parsed.data.timestamp) < startedAt) {
      return []
    }

    return [parsed.data]
  })
}

function summarize(observations: Observation[]) {
  const spans = (name: string) => observations.flatMap((entry) => entry.kind === "span" && entry.name === name ? [entry.durationMs] : [])
  const events = (name: string) => observations.filter((entry) => entry.name === name)
  const total = (name: string) => Math.round(spans(name).reduce((sum, value) => sum + value, 0))
  const usage = events("pi.usage")
  const sum = (entries: Observation[], key: "inputTokens" | "outputTokens" | "cacheReadTokens" | "captureMs" | "connectMs" | "openMs" | "prepareMs" | "executeMs" | "effectMs" | "commands") => entries.reduce((value, entry) => value + (entry.attributes?.[key] ?? 0), 0)
  const result = events("browser.jev.result").at(-1)?.attributes
  const jevRunMs = total("browser.jev.run")
  const browserActionMs = total("browser.action")
  const turnMs = total("pi.turn")

  return {
    principal: { rounds: usage.length, models: [...new Set(usage.flatMap((entry) => entry.attributes?.model ? [entry.attributes.model] : []))], inputTokens: sum(usage, "inputTokens"), cacheReadTokens: sum(usage, "cacheReadTokens"), outputTokens: sum(usage, "outputTokens") },
    tools: events("pi.tool").map((entry) => entry.attributes?.tool ?? "unknown"),
    browserActions: observations.flatMap((entry) => entry.kind === "span" && entry.name === "browser.action" ? [entry.attributes?.state ?? "unknown"] : []),
    jev: result ? { status: result.status, reason: result.reason, calls: result.count, inputTokens: result.inputTokens, outputTokens: result.outputTokens, commands: result.commands, recoveries: result.recoveries, discarded: result.discarded } : null,
    decisions: events("browser.jev.decision").map((entry) => ({ state: entry.attributes?.state, percent: entry.attributes?.percent, targetPercent: entry.attributes?.targetPercent })),
    // Sequential phases inside one turn: the Jev run and conventional browser actions are tool time; the rest of the turn is the principal model and its overhead.
    phases: {
      turnMs,
      jevRunMs,
      browserActionMs,
      outsideBrowserMs: Math.max(0, turnMs - jevRunMs - browserActionMs),
      jevObserveMs: total("browser.jev.verify"),
      jevDecideMs: total("browser.jev.decide"),
      jevAuthorizeMs: total("browser.jev.authorize"),
      jevExecuteMs: total("browser.jev.execute"),
      connectMs: sum(events("browser.jev.observation"), "connectMs"),
      openMs: sum(events("browser.jev.observation"), "openMs"),
      captureMs: sum(events("browser.jev.observation"), "captureMs"),
      prepareMs: sum(events("browser.jev.action"), "prepareMs"),
      executeMs: sum(events("browser.jev.action"), "executeMs"),
      effectMs: sum(events("browser.jev.action"), "effectMs"),
      driverCommands: sum(events("browser.jev.observation"), "commands") + sum(events("browser.jev.action"), "commands"),
    },
  }
}

async function attempt(scenario: Scenario, mode: string, repetition: number) {
  if (!await reset()) {
    return { scenario: scenario.name, group: scenario.group, mode, repetition, startedAt: new Date().toISOString(), environment: "page_hidden", turnDurationMs: 0, verified: false, detail: "page_hidden", principal: { rounds: 0 }, jev: null }
  }

  await client.conversations.newSession({ botId })
  const control = new AbortController()
  const stream = client.conversations.events(undefined, { signal: control.signal })
  const startedAt = Date.now()
  const finished = (async () => {
    let permissions = 0

    for await (const item of await stream) {
      if (item.botId !== botId) {
        continue
      }

      if (item.event.type === "permission-requested") {
        permissions += 1
      }

      if (item.event.type === "finished") {
        return { reason: item.event.reason, permissions }
      }
    }

    return { reason: "disconnected", permissions }
  })()
  await client.conversations.send({ botId, content: prompt(scenario, mode, repetition), images: [] })
  const timer = setTimeout(() => {
    void client.conversations.abort({ botId })
    control.abort()
  }, 180_000)
  const result = await finished.catch(() => ({ reason: "timeout", permissions: 0 })).finally(() => {
    clearTimeout(timer)
    control.abort()
  })
  const turnDurationMs = Date.now() - startedAt
  const verification = await verify(scenario).catch((error: Error) => ({ verified: false, detail: `verification_failed: ${error.message}` }))
  const verificationMs = Date.now() - startedAt - turnDurationMs
  await Bun.sleep(150)

  return { scenario: scenario.name, group: scenario.group, mode, repetition, startedAt: new Date(startedAt).toISOString(), turnDurationMs, verificationMs, ...verification, ...result, ...summarize(await readObservations(startedAt)) }
}

const selected = scenarios.filter((scenario) => (values.scenario ? values.scenario.split(",").includes(scenario.name) : scenario.group === "principal" || values.reserved))
const modes = values.modes.split(",")
const commit = (await Bun.$`git rev-parse --short HEAD`.text()).trim()
const dirty = (await Bun.$`git status --porcelain -- src bench`.text()).trim().length > 0
const results: unknown[] = []

for (const scenario of selected) {
  for (let repetition = 1; repetition <= Number(values.repetitions); repetition += 1) {
    // Alternating the order spreads drift in the shared desktop and network across both modes.
    const order = repetition % 2 === 1 ? modes : [...modes].reverse()

    for (const mode of order) {
      const record = await attempt(scenario, mode, repetition)
      results.push(record)
      await Bun.write(output, JSON.stringify({ botId, provider: bot.provider, model: bot.model, effort: bot.effort, permissionMode: bot.permissionMode, jevModel: configured.verification.model, commit, dirty, agentBrowser: "0.36.0", results }, null, 2))
      console.log(JSON.stringify({ scenario: record.scenario, mode, repetition, turnDurationMs: record.turnDurationMs, verified: record.verified, rounds: record.principal.rounds, jev: record.jev?.reason ?? null }))
    }
  }
}
