import { APIError, TypeSafeClient, type SystemOneRequest } from "@typesafe-ai/sdk"
import { z } from "zod"
import type { JevFailure } from "@src/shared/jev"

const probability = z.number().min(0).max(1)
const answer = z.object({ type: z.literal("choice"), choice: z.string(), confidence: probability, probabilities: z.record(z.string(), probability) })
const response = z.object({
  model: z.string().min(1),
  answers: z.record(z.string(), answer),
  usage: z.object({ input_tokens: z.int().nonnegative(), output_tokens: z.int().nonnegative() }).transform((usage) => ({ inputTokens: usage.input_tokens, outputTokens: usage.output_tokens })),
})

export class JevError extends Error {
  constructor(readonly reason: JevFailure) {
    super(`Jev: ${reason}`)
  }
}

export function createJevClient(key: string) {
  const client = new TypeSafeClient({ apiKey: key, defaultModel: "jev-latest", logLevel: "off", retry: { maxRetries: 0 }, timeout: 10_000 })

  return {
    async decide(request: SystemOneRequest, signal: AbortSignal) {
      const raw = await client.systemOne(request, { signal }).catch((error: unknown) => {
        if (signal.aborted) {
          throw new JevError("cancelled")
        }

        if (error instanceof APIError && (error.status === 401 || error.status === 403)) {
          throw new JevError("rejected")
        }

        if (error instanceof APIError && (error.status === 429 || error.status === 402)) {
          throw new JevError("limited")
        }

        throw new JevError("unavailable")
      })
      const parsed = response.safeParse(raw)

      if (!parsed.success) {
        throw new JevError("invalid_response")
      }

      for (const [name, question] of Object.entries(request.questions)) {
        const result = parsed.data.answers[name]

        if (question.type !== "choice" || !result || !Object.hasOwn(question.criteria, result.choice) || Object.keys(result.probabilities).some((key) => !Object.hasOwn(question.criteria, key)) || Object.keys(question.criteria).some((key) => !Object.hasOwn(result.probabilities, key))) {
          throw new JevError("invalid_response")
        }

        const total = Object.values(result.probabilities).reduce((sum, value) => sum + value, 0)

        if (Math.abs(total - 1) > 0.02) {
          throw new JevError("invalid_response")
        }
      }

      return parsed.data
    },
  }
}
