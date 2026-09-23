import { afterEach, expect, test } from "bun:test"
import { choice } from "@typesafe-ai/sdk"
import { join } from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createJevClient } from "@src/engine/browser/jev-client"
import { createJev } from "@src/engine/browser/jev"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createSecrets } from "@src/shared/secrets"
import { JevMock } from "../mocks/jev"

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  JevMock.helpers.respond({})
  for (const cleanup of cleanups.splice(0)) {
    await cleanup()
  }
})

async function configuration() {
  const directory = await mkdtemp(join(tmpdir(), "mimo-jev-"))
  const { observability } = createObservationSystem({ appSessionId: "jev-test", logDirectory: join(directory, "logs"), development: false })
  const path = join(directory, "mimo.sqlite")
  let database = openDatabase(path, observability)
  const secrets = createSecrets("ab".repeat(32))
  cleanups.push(async () => { await observability.flush(); database.close(); await rm(directory, { recursive: true, force: true }) })
  return {
    jev: createJev({ database, secrets }),
    stored: () => database.jev.get(),
    reopen() { database.close(); database = openDatabase(path, observability); return createJev({ database, secrets }) },
  }
}

const request = { state: { word: "blue" }, questions: { color: choice("Which color?", { blue: "blue", red: "red" }) } }

test("salva cifrada, verifica resposta real HTTP, reinicia e remove sem devolver a chave", async () => {
  const app = await configuration()
  expect(app.jev.status()).toEqual({ configured: false, verification: null })
  expect(await app.jev.save({ key: "test-secret-1" })).toMatchObject({ ok: true, verification: { model: "jev-test", inputTokens: 30, outputTokens: 5 } })
  expect(app.stored()?.key).not.toContain("test-secret-1")
  expect(JSON.stringify(app.jev.status())).not.toContain("test-secret-1")
  const restarted = app.reopen()
  expect(restarted.status()).toMatchObject({ configured: true, verification: { model: "jev-test" } })
  expect(await restarted.save({ key: "test-secret-2" })).toMatchObject({ ok: true })
  expect(restarted.remove()).toEqual({ configured: false, verification: null })
  expect(app.stored()).toBeUndefined()
  expect(await restarted.verify()).toEqual({ ok: false, reason: "not_configured" })
})

test.each([[401, "rejected"], [403, "rejected"], [429, "limited"], [402, "limited"], [529, "unavailable"]] as const)("classifica HTTP %s sem descartar a chave nem repetir a consulta", async (status, reason) => {
  const app = await configuration()
  JevMock.helpers.respond({ status: Number(status) })
  expect(await app.jev.save({ key: "test-key" })).toEqual({ ok: false, reason })
  expect(app.jev.status()).toEqual({ configured: true, verification: null })
  expect(JevMock.helpers.requests).toHaveLength(1)
})

test("resposta com escolha desconhecida não atravessa a fronteira", async () => {
  JevMock.helpers.respond({ choices: { color: "unknown" } })
  const result = await createJevClient("test-key").decide(request, new AbortController().signal).catch((error: unknown) => error)
  expect(result).toMatchObject({ reason: "invalid_response" })
})

test("remover a chave cancela HTTP pendente e impede ressuscitar a configuração", async () => {
  const app = await configuration()
  await app.jev.save({ key: "test-key" })
  const session = app.jev.session(new AbortController().signal)
  JevMock.helpers.respond({ delay: 200 })
  const pending = session.decide(request).catch((error: unknown) => error)
  app.jev.remove()
  expect(await pending).toMatchObject({ reason: "cancelled" })
  expect(session.signal.aborted).toBe(true)
  expect(app.jev.status()).toEqual({ configured: false, verification: null })
})

test("substituir durante verificação cancela a anterior e preserva a nova chave", async () => {
  const app = await configuration()
  JevMock.helpers.respond({ delay: 100 })
  const first = app.jev.save({ key: "old-key" })
  const second = app.jev.save({ key: "new-key" })
  expect(await first).toEqual({ ok: false, reason: "cancelled" })
  expect(await second).toMatchObject({ ok: true })
  expect(app.jev.status().configured).toBe(true)
})
