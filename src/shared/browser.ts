import { z } from "zod"

const botId = z.string().min(1)
const ref = z.string().regex(/^@e[0-9]+$/)
const pageUrl = z.url({ protocol: /^https?$/ })

export const browserAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("navigate"), url: pageUrl }),
  z.object({ action: z.literal("snapshot") }),
  z.object({ action: z.literal("take_control") }),
  z.object({ action: z.literal("click"), target: ref }),
  z.object({ action: z.literal("fill"), target: ref, text: z.string().max(20_000) }),
  z.object({ action: z.literal("press"), key: z.enum(["Enter", "Tab", "Escape", "ArrowDown", "ArrowUp", "Backspace"]) }),
  z.object({ action: z.literal("scroll"), direction: z.enum(["up", "down"]) }),
  z.object({ action: z.literal("handoff"), reason: z.string().min(1).max(500) }),
  z.object({ action: z.literal("close") }),
])

export const browserRun = z.strictObject({
  action: z.literal("run"),
  url: pageUrl.optional(),
  objective: z.string().trim().min(1).max(1000),
  values: z.array(z.strictObject({ name: z.string().min(1).max(80), text: z.string().max(1000) })).max(10).default([]),
  done: z.array(z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("url"), value: z.string().min(1).max(500) }),
    z.strictObject({ kind: z.literal("title"), value: z.string().min(1).max(200) }),
    z.strictObject({ kind: z.literal("text"), value: z.string().min(1).max(200) }),
    z.strictObject({ kind: z.literal("field"), name: z.string().min(1).max(80), value: z.string().max(1000) }),
  ])).min(1).max(5),
})

const browserStep = z.discriminatedUnion("action", [
  browserAction.options[3],
  browserAction.options[4],
  browserAction.options[6],
  z.object({ action: z.literal("wait") }),
])

const browserCandidate = z.object({
  ref,
  role: z.string(),
  name: z.string(),
  operations: z.array(z.enum(["click", "fill"])),
  value: z.string().optional(),
  url: z.string().optional(),
  expanded: z.boolean().optional(),
  selected: z.boolean().optional(),
  disabled: z.boolean().optional(),
  context: z.string().optional(),
})

const observationTiming = z.object({ connectMs: z.number(), openMs: z.number(), captureMs: z.number(), commands: z.int() })

export const browserObservation = z.object({
  id: z.uuid(),
  url: z.string(),
  title: z.string(),
  text: z.string(),
  scroll: z.object({ above: z.boolean(), below: z.boolean() }),
  loading: z.boolean(),
  candidates: z.array(browserCandidate),
  omitted: z.int().min(0),
  valid: z.boolean(),
  evidence: z.array(z.boolean()),
  fingerprint: z.string(),
  timing: observationTiming,
})

export const browserActResult = z.discriminatedUnion("applied", [
  z.object({ applied: z.literal(false), reason: z.enum(["page_changed", "target_unusable", "outside_pilot", "page_hidden"]) }),
  z.object({ applied: z.literal(true), effect: z.enum(["confirmed", "none"]), timing: z.object({ prepareMs: z.number(), executeMs: z.number(), effectMs: z.number(), commands: z.int() }), observation: browserObservation }),
])

export const browserCommand = z.discriminatedUnion("action", [
  ...browserAction.options,
  z.object({ action: z.literal("observe"), url: pageUrl.optional(), done: browserRun.shape.done }),
  z.object({ action: z.literal("act"), observationId: z.uuid(), step: browserStep, done: browserRun.shape.done }),
])

export const browserOpen = z.object({ botId, botName: z.string().min(1), url: z.url({ protocol: /^https?$/ }) })

export type BrowserOpen = z.infer<typeof browserOpen>

export const browserRequest = z.object({
  type: z.literal("browser-request"),
  id: z.uuid(),
  botId,
  botName: z.string().min(1),
  input: browserCommand,
})

const browserReply = z.object({
  type: z.literal("browser-reply"),
  id: z.uuid(),
  result: z.string(),
  error: z.boolean(),
})

export const browserCancel = z.object({ type: z.literal("browser-cancel"), id: z.uuid() })

export const browserBounds = z.object({ x: z.int().min(0), y: z.int().min(0), width: z.int().min(1), height: z.int().min(1) })

export const browserFrameInput = z.object({ botId, after: z.int().min(0) })

export const browserFrame = z.object({
  seq: z.int().min(1),
  width: z.int().min(1),
  height: z.int().min(1),
  image: z.string().min(1),
})

const browserPreview = z.object({
  botId,
  botName: z.string().min(1),
  url: z.string(),
  title: z.string(),
  control: z.enum(["bot", "user"]),
  openedBy: z.enum(["bot", "user"]),
  popup: z.boolean(),
  reason: z.string().nullable(),
  image: z.string().nullable(),
  error: z.string().nullable(),
})

export const browserPages = z.array(browserPreview)

export const browserFrameRequest = z.object({ type: z.literal("browser-frame-request"), id: z.uuid(), input: browserFrameInput })

const browserFrameReply = z.object({ type: z.literal("browser-frame-reply"), id: z.uuid(), frame: browserFrame.nullable(), error: z.string().nullable() })

export const browserPagesMessage = z.object({ type: z.literal("browser-pages"), pages: browserPages })

export const browserMainMessage = z.discriminatedUnion("type", [browserReply, browserFrameReply, browserPagesMessage])

export interface BrowserState {
  pages: BrowserPreview[]
  focusedBotId: string | null
}

export type BrowserAction = z.infer<typeof browserAction>
export type BrowserCommand = z.infer<typeof browserCommand>
export type BrowserRun = z.infer<typeof browserRun>
export type BrowserStep = z.infer<typeof browserStep>
export type BrowserCandidate = z.infer<typeof browserCandidate>
export type BrowserObservation = z.infer<typeof browserObservation>
export type BrowserActResult = z.infer<typeof browserActResult>
export type BrowserRequest = z.infer<typeof browserRequest>
export type BrowserReply = z.infer<typeof browserReply>
export type BrowserBounds = z.infer<typeof browserBounds>
export type BrowserFrameInput = z.infer<typeof browserFrameInput>
export type BrowserFrame = z.infer<typeof browserFrame>
export type BrowserPreview = z.infer<typeof browserPreview>
export type BrowserFrameReply = z.infer<typeof browserFrameReply>
export type BrowserPagesMessage = z.infer<typeof browserPagesMessage>
