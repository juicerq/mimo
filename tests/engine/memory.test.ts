import { afterEach, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { migrations } from "@src/engine/persistence/migrations"
import { bots as botTable, messages as messageTable } from "@src/engine/persistence/schema"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createBots, newBot } from "@src/engine/bots/bots"
import { createMemory } from "@src/engine/memory/memory"
import { memoryUsage } from "@src/shared/memory-limits"
import type { ConversationMessage } from "@src/shared/conversations"
import { must, rejects } from "../support/expect"
import { curate, memoryCurationVersion } from "@src/engine/memory/curation"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import type { PiCustomTool, PiRuntimeEvent, PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup()
  }
})

async function memoryApp(run: (tool: (name: string, params: Record<string, string>) => Promise<string>, content: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "mimo-memory-"))
  const { observability } = createObservationSystem({ appSessionId: "memory", logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, "mimo.sqlite"), observability)
  const factory: PiSessionFactory = {
    async open(input) {
      const listeners = new Set<(event: PiRuntimeEvent) => void>()

      return {
        async prompt({ content }) {
          await run(async (name, params) => must(input.customTools?.find((tool) => tool.name === name)).execute(params), content)

          for (const listener of listeners) {
            listener({ type: "finished", reason: "stop" })
          }
        },
        async steer() {},
        async compact() { return { tokensBefore: 0 } },
        async abort() {},
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() { listeners.clear() },
      }
    },
  }
  const providers = { async list() { return [] }, async models() { return [] } }
  const bots = createBots({ database, observability, privateBotsDirectory: directory, providers, conversations: { async close() {}, isActive: () => false, setPermissionMode() {} } })
  const bot = newBot({ name: "Pessoal", provider: "codex", function: { outcome: "Ajudar a pessoa" }, leaderBotId: null, projectId: null, workingDirectoryOverride: null })
  database.bots.create(bot)
  const memory = createMemory({ database, bots, observability, providers, sessionFactory: factory, conversations: { active: () => undefined, async *events() {} } })
  cleanups.push(async () => {
    await memory.dispose()
    await observability.flush()
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  function message(id: string, content: string, author: ConversationMessage["author"] = "person") {
    database.conversations.append({ id, botId: bot.id, content, author, authorBotId: null, taskId: null, triggerRunId: null, images: [], activity: null, ending: null, createdAt: "2026-06-28T12:00:00.000Z" })
  }

  function manual(content: string) {
    const saved = memory.add({ botId: bot.id, content })
    database.memories.update(saved.id, { content, origin: "person", sourceMessageId: null, curationVersion: memoryCurationVersion, createdAt: "2026-06-25T12:00:00.000Z" })

    return saved.id
  }

  return { database, bots, bot, memory, message, manual }
}

test("superar preserva texto manual e evidência, libera contexto e permite buscar e esquecer o passado", async () => {
  let id = ""
  const app = await memoryApp(async (tool) => {
    await rejects(tool("rewrite", { id, content: "Outro texto" }), "Only the person")
    await rejects(tool("forget", { id }), "Only the person")
    await rejects(tool("supersede", { id, message: "routine" }), "person message")
    await tool("supersede", { id, message: "arrival" })
    await tool("remember", { content: "Usa o Xteink X4 para ler diariamente.", message: "arrival" })
  })
  id = app.manual("Esperando o Xteink X4 chegar.")
  app.message("routine", "O Xteink chegou", "routine")
  app.message("arrival", "Meu Xteink X4 chegou. Vou usá-lo para ler diariamente.")
  await app.memory.retry(app.bot.id)

  const historical = must(app.memory.list(app.bot.id).find((memory) => memory.id === id))
  expect(historical).toMatchObject({ content: "Esperando o Xteink X4 chegar.", origin: "person", createdAt: "2026-06-25T12:00:00.000Z", supersededAt: "2026-06-28T12:00:00.000Z", supersededBy: { id: "arrival", author: "person" } })
  expect(memoryUsage([historical])).toBe(0)
  const instructions = app.memory.instructions(app.bot)
  expect(instructions).not.toContain("Esperando o Xteink")
  expect(instructions).toContain("Usa o Xteink")
  const search = must(app.memory.tools(app.bot).at(0))
  expect(JSON.parse(await search.execute({ query: "xteink esperando" })).matches).toMatchObject([{ id, status: "superseded" }])
  expect(app.database.memories.search("another-bot", { query: "xteink", offset: 0 }).matches).toEqual([])
  expect(app.memory.tools({ ...app.bot, temporary: true })).toEqual([])
  app.memory.forget(id)
  expect(JSON.parse(await search.execute({ query: "esperando" })).matches).toEqual([])
  expect(app.database.curation.batch(app.bot.id).messages).toEqual([])
})

test.each(["before", "during"])("esquecer %s da Curadoria preserva aprendizado independente sem recriar a evidência antiga", async (timing) => {
  let phase = "initial"
  let id = ""
  const app = await memoryApp(async (tool) => {
    if (phase === "initial") {
      await tool("remember", { content: "Não tem bicicleta dobrável.", message: "bicycle" })

      return
    }

    await tool("remember", { content: "Precisa de gráficos com rótulos por ser daltônico.", message: "accessibility" })

    if (phase === "during") {
      app.memory.forget(id)
    }
  })
  app.message("bicycle", "Não tenho bicicleta dobrável.")
  await app.memory.retry(app.bot.id)
  id = must(app.memory.list(app.bot.id).at(0)).id
  app.message("accessibility", "Sou daltônico e preciso que gráficos usem rótulos, não apenas cores.")
  phase = timing

  if (timing === "during") {
    await rejects(app.memory.retry(app.bot.id), "Memória mudou")
  } else {
    app.memory.forget(id)
  }

  expect(app.memory.list(app.bot.id)).toEqual([])
  expect(app.database.curation.batch(app.bot.id).messages.map((message) => message.id)).toEqual(["accessibility"])
  phase = "retry"
  await app.memory.retry(app.bot.id)
  expect(app.memory.list(app.bot.id)).toMatchObject([{ content: "Precisa de gráficos com rótulos por ser daltônico.", sourceMessageId: "accessibility" }])
  expect(app.database.memories.search(app.bot.id, { query: "bicicleta", offset: 0 }).matches).toEqual([])
  expect(app.database.curation.batch(app.bot.id).messages).toEqual([])
})

test("falha descarta alterações e mantém o lote; edição concorrente prevalece e mensagens novas ficam pendentes", async () => {
  let phase = "failure"
  let id = ""
  const app = await memoryApp(async (tool) => {
    await tool("remember", { content: "Prefere português.", message: "preference" })

    if (phase === "failure") {
      throw new Error("Fornecedor interrompido")
    }

    if (phase === "edit") {
      app.memory.update({ id, content: "Prefiro respostas bem curtas." })
    }

    if (phase === "success") {
      app.message("later", "Meu cachorro se chama Max.")
    }
  })
  id = app.manual("Prefiro respostas curtas.")
  app.message("preference", "Prefiro conversar em português.")
  await rejects(app.memory.retry(app.bot.id), "Fornecedor interrompido")
  expect(app.memory.list(app.bot.id)).toHaveLength(1)
  expect(app.database.curation.batch(app.bot.id).messages).toHaveLength(1)
  phase = "edit"
  await rejects(app.memory.retry(app.bot.id), "Memória mudou")
  expect(app.memory.list(app.bot.id).map((memory) => memory.content)).toEqual(["Prefiro respostas bem curtas."])
  phase = "success"
  await app.memory.retry(app.bot.id)
  expect(app.memory.list(app.bot.id)).toHaveLength(2)
  expect(app.database.curation.batch(app.bot.id).messages.map((message) => message.id)).toEqual(["later"])
})

test("limpar e desligar descartam aprendizado pendente e invalidam uma passagem em andamento", async () => {
  const app = await memoryApp(async (tool) => {
    await tool("remember", { content: "Mora em Recife.", message: "home" })
    app.memory.clear(app.bot.id)
  })
  app.manual("Mora em São Paulo.")
  app.message("home", "Mudei para Recife.")
  await rejects(app.memory.retry(app.bot.id), "Memória mudou")
  expect(app.memory.list(app.bot.id)).toEqual([])
  expect(app.database.curation.batch(app.bot.id).messages).toEqual([])

  await app.bots.update({ ...app.bot, memoryEnabled: false })
  app.message("disabled", "Prefiro café.")
  await app.bots.update({ ...app.bot, memoryEnabled: true })
  expect(app.database.curation.batch(app.bot.id).messages).toEqual([])
  app.message("new", "Prefiro chá.")
  expect(app.database.curation.batch(app.bot.id).messages.map((message) => message.id)).toEqual(["new"])
})

test("resposta curta leva as opções da pergunta anterior, sem torná-la nova evidência", async () => {
  const app = await memoryApp(async (tool, content) => {
    expect(content).toContain("Explicações detalhadas")
    expect(content).toContain("a segunda")
    await rejects(tool("remember", { content: "Prefere explicações detalhadas.", message: "question" }), "person message")
    await tool("remember", { content: "Prefere explicações detalhadas.", message: "answer" })
  })
  app.database.conversations.append({ id: "question", botId: app.bot.id, author: "bot", authorBotId: app.bot.id, taskId: null, triggerRunId: null, content: "Qual estilo você prefere para nossas conversas?", images: [], activity: null, ending: null, createdAt: "2026-06-28T11:59:00.000Z", question: { options: [{ value: "short", label: "Respostas curtas" }, { value: "detailed", label: "Explicações detalhadas" }], allowOther: true, multiple: false } })
  app.database.curation.skip(app.bot.id)
  app.message("answer", "a segunda")
  await app.memory.retry(app.bot.id)
  expect(app.memory.list(app.bot.id)).toMatchObject([{ content: "Prefere explicações detalhadas.", sourceMessageId: "answer" }])
})

test("revisa Lembranças aprendidas uma vez sem alterar as adicionadas pela pessoa", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mimo-memory-"))
  const { observability } = createObservationSystem({ appSessionId: "memory", logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, "mimo.sqlite"), observability)
  const bot = newBot({ name: "Mimo Manager", provider: "codex", function: { outcome: "Ajudar a pessoa" }, leaderBotId: null, projectId: null, workingDirectoryOverride: null })
  database.bots.create(bot)

  const createdAt = new Date().toISOString()
  database.memories.create({ id: "manual", botId: bot.id, content: "Sempre escreva em português.", origin: "person", sourceMessageId: null, supersededAt: null, supersededByMessageId: null, curationVersion: 0, createdAt })
  database.memories.create({ id: "verbose", botId: bot.id, content: "A pessoa informou que prefere textos de interface curtos e diretos.", origin: "bot", sourceMessageId: null, supersededAt: null, supersededByMessageId: null, curationVersion: 0, createdAt })
  database.memories.create({ id: "routine", botId: bot.id, content: "A pessoa pediu para supervisionar os testes a cada 10 minutos.", origin: "bot", sourceMessageId: null, supersededAt: null, supersededByMessageId: null, curationVersion: 0, createdAt })

  let manualMutation = ""
  const factory: PiSessionFactory = {
    async open(input) {
      const listeners = new Set<(event: PiRuntimeEvent) => void>()
      const emit = (event: PiRuntimeEvent) => {
        for (const listener of listeners) {
          listener(event)
        }
      }
      const tool = (name: string) => {
        const selected = (input.customTools as PiCustomTool[] | undefined)?.find((candidate) => candidate.name === name)

        if (!selected) {
          throw new Error(`Tool ${name} not found`)
        }

        return selected
      }

      return {
        async prompt() {
          await tool("rewrite").execute({ id: "verbose", content: "Prefere textos de interface curtos e diretos." })
          await tool("forget").execute({ id: "routine" })
          manualMutation = await tool("rewrite").execute({ id: "manual", content: "Responda em português." }).catch((error: unknown) => error instanceof Error ? error.message : String(error))
          emit({ type: "finished", reason: "stop" })
        },
        async steer() {},
        async compact() { return { tokensBefore: 0 } },
        async abort() {},
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() { listeners.clear() },
      }
    },
  }

  cleanups.push(async () => {
    await observability.flush()
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  expect(database.memories.outdatedBotIds(memoryCurationVersion)).toEqual([bot.id])

  await curate({ database, observability, sessionFactory: factory, bot, cwd: directory, batch: database.curation.batch(bot.id), signal: new AbortController().signal })

  expect(manualMutation).toContain("Only the person")
  expect(database.memories.snapshot(bot.id)).toEqual([
    { id: "manual", botId: bot.id, content: "Sempre escreva em português.", origin: "person", sourceMessageId: null, supersededAt: null, supersededByMessageId: null, curationVersion: 0, createdAt },
    { id: "verbose", botId: bot.id, content: "Prefere textos de interface curtos e diretos.", origin: "bot", sourceMessageId: null, supersededAt: null, supersededByMessageId: null, curationVersion: memoryCurationVersion, createdAt },
  ])
  expect(database.memories.hasOutdated(bot.id, memoryCurationVersion)).toBeFalse()
})

test("migra Notas preservando origem e pendências sem minerar conversas já processadas", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mimo-memory-migration-"))
  const path = join(directory, "mimo.sqlite")
  const sqlite = new Database(path)
  const legacy = drizzle({ client: sqlite })
  migrate(legacy, migrations.slice(0, migrations.findIndex(({ name }) => name === "20260909155316_message-memory")))
  const pending = newBot({ name: "Pendente", provider: "codex", function: { outcome: "Ajudar" }, leaderBotId: null, projectId: null, workingDirectoryOverride: null })
  const settled = { ...pending, id: "settled", name: "Processado" }
  legacy.insert(botTable).values([pending, settled]).run()

  for (const bot of [pending, settled]) {
    legacy.insert(messageTable).values({ id: bot.id, botId: bot.id, position: 1, author: "person", content: "Uso um Xteink X4.", createdAt: "2026-06-25T12:00:00.000Z" }).run()
    sqlite.query("INSERT INTO notes(id, bot_id, content, turn_author, message_id, created_at, curated_at) VALUES (?, ?, ?, 'person', ?, ?, ?)").run(`note-${bot.id}`, bot.id, "Pessoa: usa Xteink.", bot.id, "2026-06-25T12:00:00.000Z", bot.id === pending.id ? null : "2026-06-26T12:00:00.000Z")
    sqlite.query("INSERT INTO memories(id, bot_id, content, origin, note_id, created_at) VALUES (?, ?, ?, 'bot', ?, ?)").run(`memory-${bot.id}`, bot.id, "Usa um Xteink X4.", `note-${bot.id}`, "2026-06-25T12:00:00.000Z")
  }

  sqlite.close()
  const { observability } = createObservationSystem({ appSessionId: "migration", logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(path, observability)
  cleanups.push(async () => {
    await observability.flush()
    database.close()
    await rm(directory, { recursive: true, force: true })
  })
  expect(database.memories.listForBot(pending.id)).toMatchObject([{ sourceMessageId: pending.id, source: { content: "Uso um Xteink X4." }, supersededAt: null }])
  expect(database.curation.batch(pending.id).messages).toHaveLength(1)
  expect(database.curation.batch(settled.id).messages).toEqual([])
  expect(database.memories.search(settled.id, { query: "xteink", offset: 0 }).matches).toHaveLength(1)
  const migrated = new Database(path, { readonly: true })
  expect(migrated.query("SELECT name FROM sqlite_master WHERE name = 'notes'").all()).toEqual([])
  expect(migrated.query("PRAGMA foreign_key_check").all()).toEqual([])
  migrated.close()
})
