import type { ConversationActivity, ConversationEvent, IncomingMessage } from "@src/shared/conversations"
import type { PiRuntimeEvent } from "../pi/pi-agent-runtime"

type ConversationStep = ConversationActivity["steps"][number]
type ThinkingStep = Extract<ConversationStep, { type: "thinking" }>
type ToolStep = Extract<ConversationStep, { type: "tool" }>
type ActiveTool = Omit<ToolStep["tools"][number], "status"> & { status: "running" | "done" | "failed" | "denied" }
type ActiveStep =
  | ThinkingStep
  | (Omit<ToolStep, "tools"> & { tools: ActiveTool[] })

function startedTool(event: Extract<PiRuntimeEvent, { type: "tool-started" }>): ActiveTool {
  return { callId: event.callId, name: event.tool, ...(event.label ? { label: event.label } : {}), ...(event.detail ? { detail: event.detail } : {}), ...(event.brief ? { brief: event.brief } : {}), status: "running" }
}

export function createConversationActivityRecorder(messageId: string, message: IncomingMessage) {
  let thinkingStartedAt: number | undefined
  let steps: ActiveStep[] = []

  function appendThinking(text: string) {
    const lastStep = steps.at(-1)

    if (lastStep?.type === "thinking") {
      lastStep.content += text

      return
    }

    steps.push({ type: "thinking", content: text })
  }

  function appendTool(name: string, tool: ActiveTool) {
    const lastStep = steps.at(-1)

    if (lastStep?.type === "tool" && lastStep.name === name) {
      lastStep.tools.push(tool)

      return
    }

    steps.push({ type: "tool", name, tools: [tool] })
  }

  return {
    record(runtimeEvent: Exclude<PiRuntimeEvent, { type: "text" } | { type: "message-finished" }>): ConversationEvent {
      if (runtimeEvent.type === "started") {
        thinkingStartedAt = undefined
        steps = []

        return { type: "started", messageId, message }
      }

      if (runtimeEvent.type === "thinking-started") {
        thinkingStartedAt = performance.now()
        steps.push({ type: "thinking", content: "" })

        return { type: "thinking-started" }
      }

      if (runtimeEvent.type === "thinking") {
        appendThinking(runtimeEvent.text)

        return runtimeEvent
      }

      if (runtimeEvent.type === "thinking-finished") {
        const durationMs = finishThinking()

        return { type: "thinking-finished", durationMs }
      }

      if (runtimeEvent.type === "tool-started") {
        appendTool(runtimeEvent.tool, startedTool(runtimeEvent))

        return runtimeEvent
      }

      if (runtimeEvent.type === "tool-finished") {
        steps = steps.map((step) => step.type === "tool"
          ? {
              ...step,
              tools: step.tools.map((tool) => tool.callId === runtimeEvent.callId
                ? { ...tool, status: finishedStatus(runtimeEvent), ...(runtimeEvent.error ? { error: runtimeEvent.error } : {}) }
                : tool),
            }
          : step)

        return runtimeEvent
      }

      if (runtimeEvent.type === "tool-progress") {
        steps = steps.map((step) => step.type === "tool" ? { ...step, tools: step.tools.map((tool) => tool.callId === runtimeEvent.callId ? { ...tool, label: runtimeEvent.label, detail: runtimeEvent.detail, brief: runtimeEvent.brief } : tool) } : step)

        return runtimeEvent
      }

      if ((runtimeEvent.type === "finished" || runtimeEvent.type === "provider-waiting") && thinkingStartedAt !== undefined) {
        finishThinking()
      }

      return runtimeEvent
    },
    takeSnapshot(): ConversationActivity {
      const snapshot = {
        steps: steps.flatMap((step): ConversationActivity["steps"] => {
          if (step.type === "thinking") {
            if (!step.content && !step.durationMs) {
              return []
            }

            return [step]
          }

          const tools = step.tools.filter((tool): tool is ToolStep["tools"][number] => tool.status !== "running")

          if (tools.length === 0) {
            return []
          }

          return [{ type: "tool", name: step.name, tools }]
        }),
      }

      thinkingStartedAt = undefined
      steps = []

      return snapshot
    },
  }

  function finishThinking() {
    const durationMs = Math.max(1, Math.round(performance.now() - (thinkingStartedAt ?? performance.now())))
    const lastStep = steps.at(-1)

    if (lastStep?.type === "thinking") {
      lastStep.durationMs = durationMs
    }

    thinkingStartedAt = undefined

    return durationMs
  }
}

function finishedStatus(event: { failed: boolean; denied?: boolean }) {
  if (event.denied) {
    return "denied" as const
  }

  if (event.failed) {
    return "failed" as const
  }

  return "done" as const
}
