import { parseArgs } from "node:util"
import { join } from "node:path"
import { homedir } from "node:os"
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ContractRouterClient } from "@orpc/contract"
import { z } from "zod"
import type { engineContract } from "@src/shared/engine-contract"
import type { BrowserRun } from "@src/shared/browser"
import { observation } from "@src/shared/observability/observation"
import { connectCdp } from "./cdp"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { bot: { type: "string" }, port: { type: "string", default: "9222" }, repetitions: { type: "string", default: "5" }, scenario: { type: "string" }, output: { type: "string" } } })
if (!values.bot || !values.output) {
  throw new Error("Use --bot <Bot piloto no Mimo Dev> --output <arquivo.json>")
}
const botId = values.bot
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
const schema = z.array(z.object({ type: z.string(), url: z.string(), webSocketDebuggerUrl: z.string() }))

const scenarios: { name: string; url: string; objective: string; values: BrowserRun["values"]; done: BrowserRun["done"] }[] = [
  { name: "secao", url: "http://127.0.0.1:41920/?order=1", objective: "Abra Faturas e pare antes de qualquer pagamento", values: [], done: [{ kind: "url", value: "#faturas" }, { kind: "text", value: "Faturas fictícias" }] },
  { name: "registro", url: "http://127.0.0.1:41920/?order=2", objective: "Localize a fatura de agosto de 2026, abra os detalhes e pare sem pagar", values: [], done: [{ kind: "url", value: "#agosto" }, { kind: "text", value: "Detalhes da fatura de agosto de 2026" }] },
  { name: "formulario", url: "http://127.0.0.1:41920/?order=0", objective: "Abra Suporte e preencha somente Assunto com o valor fornecido, sem enviar", values: [{ name: "Assunto", text: "Consulta fictícia" }], done: [{ kind: "url", value: "#suporte" }, { kind: "field", name: "Assunto", value: "Consulta fictícia" }] },
  { name: "documentacao", url: "https://docs.typesafe.ai/", objective: "Encontre e abra a página JavaScript SDK na documentação da TypeSafe", values: [], done: [{ kind: "url", value: "/sdk/javascript" }, { kind: "text", value: "JavaScript SDK" }] },
]

async function verify(scenario: typeof scenarios[number]) {
  const targets = schema.parse(await (await fetch(`http://127.0.0.1:${values.port}/json`)).json())
  const target = targets.find((target) => target.type === "page" && target.url.startsWith(new URL(scenario.url).origin))
  if (!target) {
    return false
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise<void>((resolve, reject) => { socket.onopen = () => resolve(); socket.onerror = () => reject(new Error("CDP unavailable")) })
  const expression = `(${(conditions: BrowserRun["done"]) => conditions.every((condition) => {
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
  })})(${JSON.stringify(scenario.done)}) && document.body.dataset.paid !== 'true'`
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Verification timed out")), 5000)
      socket.onmessage = (event) => {
        const response = z.object({ id: z.number(), result: z.object({ result: z.object({ value: z.boolean().optional() }) }).optional() }).safeParse(JSON.parse(String(event.data)))
        if (response.success && response.data.id === 1) {
          clearTimeout(timeout)
          resolve(response.data.result?.result.value === true)
        }
      }
      socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }))
    })
  } finally { socket.close() }
}

const results: unknown[] = []
const observationsPath = join(homedir(), ".config/mimo-dev/logs/observations.jsonl")
for (const scenario of scenarios) {
  if (values.scenario && values.scenario !== scenario.name) {
    continue
  }

  for (let repetition = 0; repetition < Number(values.repetitions); repetition += 1) {
    for (const mode of repetition % 2 === 0 ? ["jev", "convencional"] : ["convencional", "jev"]) {
      await client.conversations.newSession({ botId })
      const control = new AbortController()
      const stream = client.conversations.events(undefined, { signal: control.signal })
      const startedAt = Date.now()
      const eventLoop = (async () => {
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
      const navigation = mode === "jev" ? `Depois delegue UMA vez à ferramenta browser com ${JSON.stringify({ action: "run", objective: scenario.objective, values: scenario.values, done: scenario.done })}. Se run devolver blocked, unavailable ou cancelled, pare e relate o resultado sem fallback convencional.` : `Depois execute com ações convencionais da ferramenta browser (snapshot, click, fill, scroll), usando referências observadas. NÃO use action run. Objetivo: ${scenario.objective}. Valores: ${JSON.stringify(scenario.values)}. Confira estas condições: ${JSON.stringify(scenario.done)}.`
      const content = `Experimento ${scenario.name}, ${mode}, repetição ${repetition + 1}. Use somente browser e send_message, sem shell, ferramentas de arquivos nem delegação a outros Bots. Primeiro navegue para ${scenario.url} para restaurar o estado inicial. ${navigation} Não compre, pague, exclua, envie formulários nem faça login. Mantenha a página aberta. Na resposta final diga apenas o status e a evidência observada.`
      await client.conversations.send({ botId, content, images: [] })
      const timer = setTimeout(() => { void client.conversations.abort({ botId }); control.abort() }, 120_000)
      const result = await eventLoop.catch(() => ({ reason: "timeout", permissions: 0 })).finally(() => { clearTimeout(timer); control.abort() })
      const turnDurationMs = Date.now() - startedAt
      const verified = await verify(scenario).catch(() => false)
      const durationMs = Date.now() - startedAt
      const verificationMs = durationMs - turnDurationMs
      await Bun.sleep(100)
      const observations = (await Bun.file(observationsPath).text()).trim().split("\n").flatMap((line) => {
        try {
          const parsed = observation.safeParse(JSON.parse(line))

          return parsed.success ? [parsed.data] : []
        } catch {
          return []
        }
      }).filter((entry) => entry.botId === botId && Date.parse(entry.timestamp) >= startedAt)
      const sums = Object.fromEntries(["browser.jev.decide", "browser.jev.execute", "browser.jev.verify", "browser.jev.authorize", "browser.jev.run"].map((name) => [name, observations.filter((entry) => entry.name === name && entry.kind === "span").reduce((sum, entry) => sum + (entry.kind === "span" ? entry.durationMs : 0), 0)]))
      const principalModels = [...new Set(observations.filter((entry) => entry.name === "pi.usage").flatMap((entry) => entry.attributes?.model ? [entry.attributes.model] : []))]
      const record = { scenario: scenario.name, mode, repetition: repetition + 1, startedAt: new Date(startedAt).toISOString(), principalModels, durationMs, turnDurationMs, verificationMs, verified, ...result, spans: sums, observations: observations.filter((entry) => entry.name.startsWith("browser.jev") || entry.name === "pi.usage" || entry.name === "pi.tool") }
      results.push(record)
      await Bun.write(values.output, JSON.stringify({ botId, model: bot.model, provider: bot.provider, effort: bot.effort, permissionMode: bot.permissionMode, jevModel: configured.verification.model, results }, null, 2))
      console.log(JSON.stringify({ scenario: scenario.name, mode, repetition: repetition + 1, durationMs, verified, reason: result.reason }))
    }
  }
}
