import { Database } from "bun:sqlite"
import { afterEach, beforeEach, expect, test } from "bun:test"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createPiAgentRuntime, type PiRuntimeEvent, type PiSessionFactory, type PiSessionInput } from "@src/engine/pi/pi-agent-runtime"
import { createTasks } from "@src/engine/tasks/tasks"
import { askTool, finishSilentlyTool, sendMessageTool } from "@src/shared/conversations"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { must, rejects } from "../support/expect"

const directory = mkdtempSync(join(tmpdir(), "mimo-messages-"))

beforeEach(() => mkdirSync(directory, { recursive: true }))
const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup()
  }

  rmSync(directory, { recursive: true, force: true })
})

async function conversation(source: "person" | "routine" = "person") {
  const { observability } = createObservationSystem({ appSessionId: "messages", logDirectory: join(directory, "logs"), development: false })
  const databasePath = join(directory, "mimo.sqlite")
  const database = openDatabase(databasePath, observability)
  const listeners = new Set<(event: PiRuntimeEvent) => void>()
  const opened = Promise.withResolvers<PiSessionInput>()
  const sessionInputs: PiSessionInput[] = []
  const disposed: string[] = []
  const failures: Error[] = []
  const settled = Promise.withResolvers<void>()
  const emit = (event: PiRuntimeEvent) => {
    for (const listener of listeners) {
      listener(event)
    }
  }
  const factory: PiSessionFactory = {
    async open(input) {
      const failure = failures.shift()

      if (failure) {
        throw failure
      }

      sessionInputs.push(input)
      const sessionFile = `session-${sessionInputs.length}.jsonl`
      opened.resolve(input)

      return {
        sessionFile,
        async prompt() {
          emit({ type: "started" })
          await settled.promise
        },
        async steer() {},
        async compact() { return { tokensBefore: 0 } },
        async abort() {
          emit({ type: "finished", reason: "aborted" })
          settled.resolve()
        },
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() { disposed.push(sessionFile); listeners.clear() },
      }
    },
  }
  const runtime = createPiAgentRuntime(factory, observability)
  const tasks = createTasks({ database, observability })
  const bots = createBots({
    database,
    observability,
    privateBotsDirectory: join(directory, "bots"),
    providers: { async models() { return [{ provider: "codex", name: "Codex", default: "gpt-5.6-luna", models: [{ id: "gpt-5.6-luna", name: "Luna" }, { id: "gpt-5.6-sol", name: "Sol" }] }] }, async list() { return [{ provider: "codex", name: "Codex", connection: "subscription", status: "available", connected: true, detectedKey: false }] } },
    conversations: { close: async (botId) => conversations.close(botId), isActive: (botId) => !!conversations.active(botId), setPermissionMode: (id, mode) => conversations.setPermissionMode(id, mode) },
  })
  const conversations = createConversations({ database, bots, tasks, runtime, observability, extensions: [] })
  cleanups.push(async () => {
    await conversations.dispose()
    await observability.flush()
    database.close()
  })
  const bot = await bots.create({ name: "Conversa" })
  const events = conversations.events()[Symbol.asyncIterator]()
  if (source === "routine") {
    await conversations.call({ id: "monitor", botId: bot.id, content: "Avise se algo precisa da minha atenção", frequency: { form: "once", at: new Date().toISOString() }, nextCallAt: new Date().toISOString() })
  } else {
    await conversations.send({ botId: bot.id, content: "Me explica com detalhes", images: [], replyTo: null, mentionedBotIds: [], deliver: "queue" })
  }
  const session = await opened.promise
  const tool = (name: string) => {
    const found = session.customTools?.find((candidate) => candidate.name === name)

    if (!found || !("inputSchema" in found)) {
      throw new Error(`Missing tool ${name}`)
    }

    return found
  }

  return {
    bot,
    bots,
    database,
    sessionInputs,
    disposed,
    failures,
    conversations,
    databasePath,
    observability,
    events,
    emit,
    tool,
    history: () => conversations.history({ botId: bot.id, limit: 100 }).messages,
    finish() {
      emit({ type: "finished", reason: "stop" })
      settled.resolve()
    },
  }
}

test("entrega cada mensagem durante o mesmo Turno e preserva a ordem ao reabrir o histórico", async () => {
  const c = await conversation()
  expect((await c.events.next()).value?.event.type).toBe("started")
  const messages = ["A entrega é gravada antes da confirmação.", "Depois o Bot investiga as evidências do erro.\n\n".repeat(30).trim()]

  for (const content of messages) {
    c.emit({ type: "tool-started", callId: content, tool: sendMessageTool })
    await c.tool(sendMessageTool).execute({ content })
    c.emit({ type: "tool-finished", callId: content, tool: sendMessageTool, failed: false })
    expect(c.conversations.active(c.bot.id)).toBeDefined()
    expect((await c.events.next()).value?.event).toMatchObject({ type: "message-finished", message: { content, question: null } })
    expect(c.history().at(-1)?.content).toBe(content)
  }

  c.emit({ type: "text", text: messages.join("\n\n") })
  c.emit({ type: "message-finished" })
  c.finish()
  expect((await c.events.next()).value?.event.type).toBe("finished")
  expect(c.conversations.active(c.bot.id)).toBeUndefined()
  const reopened = openDatabase(c.databasePath, c.observability)

  try {
    const history = reopened.conversations.history(c.bot.id, { limit: 100 }).messages.filter((message) => message.author === "bot")
    expect(history.map((message) => message.content)).toEqual(messages)
    expect(history.every((message) => message.activity?.steps.length === 0)).toBe(true)
  } finally {
    reopened.close()
  }
})

test("pergunta chega uma vez com opções e envios inválidos ou tardios não alteram o histórico", async () => {
  const c = await conversation()
  expect(await c.tool(sendMessageTool).execute({ content: "  " }).catch((error: unknown) => error)).toBeInstanceOf(Error)
  const question = { content: "Qual formato?", options: [{ value: "pdf", label: "PDF" }, { value: "md", label: "Markdown" }], allowOther: true, multiple: false }
  await c.tool(askTool).execute(question)
  c.emit({ type: "text", text: question.content })
  c.finish()
  expect(c.history().filter((message) => message.author === "bot")).toMatchObject([{ content: question.content, question: { options: question.options, allowOther: true, multiple: false } }])
  expect(await c.tool(sendMessageTool).execute({ content: "Envio tardio" }).catch((error: unknown) => error)).toMatchObject({ message: "No active conversation turn" })
  expect(c.history()).toHaveLength(2)
})

test("só a primeira Resposta a uma Pergunta entra na conversa, mesmo vinda de duas telas", async () => {
  const c = await conversation()
  expect((await c.events.next()).value?.event.type).toBe("started")
  const question = { content: "Qual formato?", options: [{ value: "pdf", label: "PDF" }, { value: "md", label: "Markdown" }], allowOther: false, multiple: false }
  await c.tool(askTool).execute(question)
  c.emit({ type: "text", text: question.content })
  c.finish()
  const questionId = must(c.history().find((message) => message.question)).id
  const answer = (value: string) => c.conversations.send({ botId: c.bot.id, content: "", images: [], replyTo: { messageId: questionId, optionValues: [value] }, mentionedBotIds: [], deliver: "queue" })

  const first = answer("pdf")
  await rejects(answer("md"), "Esta Pergunta já foi respondida.")
  await first
  c.finish()
  await rejects(answer("md"), "Esta Pergunta já foi respondida.")
  expect(c.history().filter((message) => message.replyTo).map((message) => message.content)).toEqual(["PDF"])
})

test("interromper preserva as mensagens enviadas e impede envios posteriores", async () => {
  const c = await conversation()
  await c.tool(sendMessageTool).execute({ content: "Achei a primeira evidência." })
  await c.conversations.abort(c.bot.id)
  expect(await c.tool(sendMessageTool).execute({ content: "Não deve chegar" }).catch((error: unknown) => error)).toBeInstanceOf(Error)
  expect(c.history().filter((message) => message.author === "bot").map(({ content, ending }) => ({ content, ending }))).toEqual([
    { content: "Achei a primeira evidência.", ending: null },
    { content: "", ending: "aborted" },
  ])
})


test("resposta sem envio termina com falha explícita, sem publicar o texto comum", async () => {
  const c = await conversation()
  expect((await c.events.next()).value?.event.type).toBe("started")
  c.emit({ type: "text", text: "Uma resposta que não foi enviada." })
  c.finish()
  expect(c.history().filter((message) => message.author === "bot")).toMatchObject([{ content: "", ending: "failed", error: expect.any(String) }])
  expect((await c.events.next()).value?.event).toMatchObject({ type: "message-finished", message: { ending: "failed" } })
  expect((await c.events.next()).value?.event).toMatchObject({ type: "finished", reason: "error" })
})


test("envio só confirma entrega depois de persistir a Mensagem", async () => {
  const c = await conversation()
  const writer = new Database(c.databasePath)

  try {
    writer.run("BEGIN IMMEDIATE")
    expect(await c.tool(sendMessageTool).execute({ content: "Achei a causa." }).catch((error: unknown) => error)).toBeInstanceOf(Error)
    expect(c.history()).toHaveLength(1)
  } finally {
    writer.run("ROLLBACK")
    writer.close()
  }

  await c.tool(sendMessageTool).execute({ content: "Achei a causa." })
  c.finish()
  expect(c.history().filter((message) => message.author === "bot").map((message) => message.content)).toEqual(["Achei a causa."])
})

test("/novo esconde o histórico só do Bot selecionado, esvazia a Fila e recarrega a sessão", async () => {
  const c = await conversation()
  const otherBot = await c.bots.create({ name: "Outro Bot" })
  c.database.conversations.append({ ...must(c.history()[0]), id: "other-bot-message", botId: otherBot.id })
  await c.tool(sendMessageTool).execute({ content: "Mensagem preservada no histórico." })
  const oldMessageId = must(c.history()[0]).id
  await c.conversations.send({ botId: c.bot.id, content: "Não levar à sessão nova", images: [], replyTo: null, mentionedBotIds: [], deliver: "queue" })
  const reset = c.conversations.newSession(c.bot.id)
  await rejects(c.conversations.newSession(c.bot.id), "Aguarde a operação da sessão terminar.")
  await rejects(c.conversations.send({ botId: c.bot.id, content: "Envio concorrente", images: [], replyTo: null, mentionedBotIds: [], deliver: "now" }), "Aguarde a operação da sessão terminar.")
  await reset

  expect(c.conversations.active(c.bot.id)).toBeUndefined()
  expect(c.disposed).toEqual(["session-1.jsonl"])
  expect(c.sessionInputs).toHaveLength(2)
  expect(c.sessionInputs.at(-1)?.sessionFile).toBeUndefined()
  expect(c.database.conversations.sessionFile(c.bot.id)).toBe("session-2.jsonl")
  expect(c.history()).toEqual([])
  expect(c.conversations.history({ botId: c.bot.id, limit: 1 }).earlier).toBe(0)
  expect(() => c.conversations.history({ botId: c.bot.id, before: oldMessageId, limit: 1 })).toThrow("Message not found")
  expect(c.conversations.history({ botId: otherBot.id, limit: 100 }).messages.map((message) => message.content)).toEqual(["Me explica com detalhes"])
  expect(c.conversations.overview().some((entry) => entry.botId === c.bot.id)).toBe(false)
  expect(c.conversations.overview().some((entry) => entry.botId === otherBot.id)).toBe(true)
  const saved = new Database(c.databasePath)
  expect(saved.query("SELECT content FROM messages WHERE bot_id = ? ORDER BY position").all(c.bot.id)).toMatchObject([
    { content: "Me explica com detalhes" },
    { content: "Mensagem preservada no histórico." },
    { content: "" },
  ])
  saved.close()
  const reopened = openDatabase(c.databasePath, c.observability)
  expect(reopened.conversations.history(c.bot.id, { limit: 100 }).messages).toEqual([])
  reopened.close()
  const initial = c.conversations.events()[Symbol.asyncIterator]()
  const next = initial.next()
  c.conversations.notify(c.bot.id, { type: "compaction-finished" })
  expect((await next).value?.event.type).toBe("compaction-finished")
  await initial.return?.()

  await c.conversations.close(c.bot.id)
  await c.conversations.send({ botId: c.bot.id, content: "Primeira mensagem nova", images: [], replyTo: null, mentionedBotIds: [], deliver: "queue" })
  expect(c.sessionInputs.at(-1)?.sessionFile).toBe("session-2.jsonl")
  expect(c.history().map((message) => message.content)).toEqual(["Primeira mensagem nova"])
})

test("/novo relê as instruções atuais e uma falha ao abrir não ressuscita a sessão anterior", async () => {
  const c = await conversation()
  await c.conversations.abort(c.bot.id)
  await c.bots.update({ ...c.bot, function: { outcome: "Use as novas instruções do harness" } })
  c.failures.push(new Error("Provider indisponível"))
  await rejects(c.conversations.newSession(c.bot.id), "Provider indisponível")
  expect(c.database.conversations.sessionFile(c.bot.id)).toBeUndefined()

  await c.conversations.send({ botId: c.bot.id, content: "Tentar novamente", images: [], replyTo: null, mentionedBotIds: [], deliver: "queue" })
  expect(c.sessionInputs.at(-1)?.sessionFile).toBeUndefined()
  expect(c.sessionInputs.at(-1)?.instructions).toContain("Use as novas instruções do harness")
  await c.conversations.abort(c.bot.id)
  await c.conversations.newSession(c.bot.id)
  expect(c.sessionInputs.at(-1)?.sessionFile).toBeUndefined()
  expect(c.database.conversations.sessionFile(c.bot.id)).toBe("session-3.jsonl")
})

test("Rotina encerra sem mensagem, alerta ou novidade no resumo", async () => {
  const c = await conversation("routine")
  expect((await c.events.next()).value?.event.type).toBe("started")
  expect(c.history()).toHaveLength(1)
  await c.tool(finishSilentlyTool).execute({})
  c.finish()
  expect((await c.events.next()).value?.event).toMatchObject({ type: "message-finished", message: { content: "", ending: null } })
  expect((await c.events.next()).value?.event).toEqual({ type: "finished", reason: "stop", silent: true })
  expect(c.conversations.overview()).toEqual([])
  const reopened = openDatabase(c.databasePath, c.observability)

  try {
    expect(reopened.conversations.lastMessages()).toMatchObject([{ author: "bot", content: "", ending: null }])
    expect(reopened.conversations.overview()).toEqual([])
  } finally {
    reopened.close()
  }
})

test("uma pergunta durante a Rotina exige resposta e invalida o encerramento silencioso", async () => {
  const c = await conversation("routine")
  await c.tool(finishSilentlyTool).execute({})
  await c.conversations.send({ botId: c.bot.id, content: "O que você encontrou?", images: [], replyTo: null, mentionedBotIds: [], deliver: "now" })
  await rejects(c.tool(finishSilentlyTool).execute({}), "A direct request needs an answer")
  c.finish()
  expect(c.history().at(-1)).toMatchObject({ ending: "failed" })
})

test("silêncio explícito não esconde uma falha posterior", async () => {
  const c = await conversation("routine")
  expect((await c.events.next()).value?.event.type).toBe("started")
  await c.tool(finishSilentlyTool).execute({})
  expect((await c.events.next()).value?.event.type).toBe("message-finished")
  c.emit({ type: "finished", reason: "error", error: "Conexão perdida" })
  expect((await c.events.next()).value?.event).toMatchObject({ type: "message-finished", message: { ending: "failed", error: "Conexão perdida" } })
  expect((await c.events.next()).value?.event).toEqual({ type: "finished", reason: "error", error: "Conexão perdida" })
  c.finish()
})
