import { z } from "zod"
import { id } from "../ids"
import { providerName } from "../providers"

export const observationName = z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/)
const outcome = z.enum(["ok", "error"])
const level = z.enum(["info", "error"])
const trace = z.strictObject({ traceId: id, spanId: id, parentSpanId: id.optional() })

export const observationAttributes = z.strictObject({
  bytes: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheWriteTokens: z.number().optional(),
  captureMs: z.number().optional(),
  code: z.string().optional(),
  commands: z.number().optional(),
  connectMs: z.number().optional(),
  contextWindow: z.number().optional(),
  cost: z.number().optional(),
  count: z.number().optional(),
  effectMs: z.number().optional(),
  executeMs: z.number().optional(),
  discarded: z.number().optional(),
  inputTokens: z.number().optional(),
  method: z.string().optional(),
  model: z.string().optional(),
  outputTokens: z.number().optional(),
  observationId: z.string().optional(),
  openMs: z.number().optional(),
  percent: z.number().optional(),
  prepareMs: z.number().optional(),
  port: z.number().optional(),
  process: z.string().optional(),
  reason: z.string().optional(),
  recoveries: z.number().optional(),
  runtime: z.string().optional(),
  state: z.string().optional(),
  status: z.string().optional(),
  target: z.string().optional(),
  valuePercent: z.number().optional(),
  tokens: z.number().optional(),
  tool: z.string().optional(),
  version: z.string().optional(),
})

export const observationContext = z.strictObject({
  appSessionId: id.optional(),
  ...trace.partial().shape,
  leaderBotId: id.optional(),
  callerBotId: id.optional(),
  botId: id.optional(),
  projectId: id.optional(),
  taskId: id.optional(),
  runId: id.optional(),
  pluginId: id.optional(),
  provider: providerName.optional(),
})

const normalizedObservationError = z.strictObject({
  type: z.string(),
  message: z.string(),
  code: z.string().optional(),
  stack: z.string().optional(),
})

const baseObservation = {
  ...observationContext.shape,
  name: observationName,
  timestamp: z.string(),
  level,
  attributes: observationAttributes.optional(),
  error: normalizedObservationError.optional(),
}

const eventObservation = z.strictObject({
  ...baseObservation,
  kind: z.literal("event"),
})
const spanObservation = z.strictObject({
  ...baseObservation,
  kind: z.literal("span"),
  durationMs: z.number(),
  outcome,
})

export const observation = z.discriminatedUnion("kind", [eventObservation, spanObservation])

export const externalObservationSpan = z.strictObject({
  ...trace.shape,
  name: observationName,
  timestamp: z.string(),
  durationMs: z.number(),
  outcome,
  attributes: observationAttributes.optional(),
  error: normalizedObservationError.optional(),
})

export type Observation = z.infer<typeof observation>
export type ObservationAttributes = z.infer<typeof observationAttributes>
export type ObservationContext = z.infer<typeof observationContext>
export type NormalizedObservationError = z.infer<typeof normalizedObservationError>
export type ExternalObservationSpan = z.infer<typeof externalObservationSpan>
