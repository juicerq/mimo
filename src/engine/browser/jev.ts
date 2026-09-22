import { choice, type SystemOneRequest } from "@typesafe-ai/sdk"
import type { Secrets } from "@src/shared/secrets"
import type { openDatabase } from "../persistence/database"
import { createJevClient, JevError } from "./jev-client"

export function createJev({ database, secrets }: { database: Pick<ReturnType<typeof openDatabase>, "jev">; secrets: Secrets }) {
  let credential = new AbortController()

  function invalidate() {
    credential.abort()
    credential = new AbortController()
  }

  function status() {
    const saved = database.jev.get()

    return { configured: !!saved, verification: saved?.verification ?? null }
  }

  async function verify(callerSignal?: AbortSignal) {
    const saved = database.jev.get()

    if (!saved) {
      return { ok: false as const, reason: "not_configured" as const }
    }

    const signal = AbortSignal.any([credential.signal, AbortSignal.timeout(12_000), ...(callerSignal ? [callerSignal] : [])])

    try {
      const result = await createJevClient(secrets.open(saved.key)).decide({ state: { word: "blue" }, questions: { color: choice("Select the color named in word.", { blue: "blue", red: "red" }) } }, signal)
      signal.throwIfAborted()

      if (result.answers.color?.choice !== "blue") {
        throw new JevError("invalid_response")
      }

      const verification = { model: result.model, ...result.usage, verifiedAt: new Date().toISOString() }
      database.jev.save({ key: saved.key, verification })

      return { ok: true as const, verification }
    } catch (error) {
      return { ok: false as const, reason: error instanceof JevError ? error.reason : "cancelled" as const }
    }
  }

  return {
    status,
    async save({ key }: { key: string }, signal?: AbortSignal) {
      invalidate()
      database.jev.save({ key: secrets.seal(key), verification: null })

      return await verify(signal)
    },
    verify,
    remove() {
      invalidate()
      database.jev.remove()

      return status()
    },
    session(callerSignal: AbortSignal) {
      const saved = database.jev.get()

      if (!saved?.verification) {
        throw new JevError("not_configured")
      }

      const signal = AbortSignal.any([credential.signal, callerSignal])
      const client = createJevClient(secrets.open(saved.key))

      return { signal, model: saved.verification.model, async decide(request: SystemOneRequest) { return await client.decide(request, signal) } }
    },
  }
}
