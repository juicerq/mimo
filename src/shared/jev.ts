import { z } from "zod"

const verification = z.object({ model: z.string().min(1), inputTokens: z.int().nonnegative(), outputTokens: z.int().nonnegative(), verifiedAt: z.string() })
const failure = z.enum(["rejected", "limited", "unavailable", "invalid_response", "cancelled", "not_configured"])

export const jevSchemas = {
  save: z.strictObject({ key: z.string().trim().min(1).max(4096) }),
  verification,
  status: z.object({ configured: z.boolean(), verification: verification.nullable() }),
  result: z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), verification }), z.object({ ok: z.literal(false), reason: failure })]),
}

export type JevVerification = z.infer<typeof verification>
export type JevFailure = z.infer<typeof failure>
