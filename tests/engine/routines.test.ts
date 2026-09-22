import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createRoutines } from "@src/engine/routines/routines"
import type { Routine } from "@src/shared/routines"
import { must } from "../support/expect"

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup()
  }
})

async function routinesApp() {
  const directory = await mkdtemp(join(tmpdir(), "mimo-routines-"))
  const { observability } = createObservationSystem({ appSessionId: "routines", logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, "mimo.sqlite"), observability)
  const calls: Routine[] = []
  const bots = createBots({
    database,
    observability,
    privateBotsDirectory: join(directory, "bots"),
    providers: { async models() { return [{ provider: "codex", name: "Codex", default: "gpt-5.6-luna", models: [{ id: "gpt-5.6-luna", name: "Luna" }] }] }, async list() { return [{ provider: "codex", name: "Codex", connection: "subscription", status: "available", connected: true, detectedKey: false }] } },
    conversations: { close: async () => {}, isActive: () => false, setPermissionMode: () => {} },
  })
  const routines = createRoutines({ database, bots, observability, conversations: { async call(routine) { calls.push(routine) } } })
  cleanups.push(async () => {
    await routines.dispose()
    await observability.flush()
    database.close()
    await rm(directory, { recursive: true, force: true })
  })

  return { bots, routines, calls }
}

test("disparar agora chama a Rotina sem mexer na agenda, e favoritar persiste na lista", async () => {
  const app = await routinesApp()
  const bot = await app.bots.create({ name: "Vigia" })
  const routine = app.routines.create({ botId: bot.id, name: "Checar deploy", content: "Veja se o deploy terminou", frequency: { form: "once", at: new Date(Date.now() + 3_600_000).toISOString() } })

  await app.routines.fireNow(routine.id)

  expect(app.calls.map((call) => call.content)).toEqual(["Veja se o deploy terminou"])
  expect(app.routines.list(bot.id)).toEqual([routine])

  app.routines.updateFavorite({ id: routine.id, favorite: true })

  expect(app.routines.list(bot.id)).toEqual([{ ...routine, favorite: true }])
  expect(() => app.routines.updateFavorite({ id: "ausente", favorite: true })).toThrow("Rotina not found")
})

test("o Bot favorita e desfavorita uma Rotina pela tool sem mexer no resto", async () => {
  const app = await routinesApp()
  const bot = await app.bots.create({ name: "Vigia" })
  const tool = must(app.routines.tools(bot).find((candidate) => candidate.name === "routine"), "A tool routine")
  const signal = new AbortController().signal
  await tool.execute({ name: "Checar deploy", content: "Veja se o deploy terminou", days: "monday", times: "09:00", favorite: "yes" }, signal)
  const created = must(app.routines.list(bot.id)[0], "A Rotina criada")

  expect(created).toMatchObject({ name: "Checar deploy", favorite: true })
  expect(app.routines.instructions(bot)).toContain("active, favorite")

  await tool.execute({ id: created.id, favorite: "no" }, signal)

  expect(app.routines.list(bot.id)).toEqual([{ ...created, favorite: false }])
})
