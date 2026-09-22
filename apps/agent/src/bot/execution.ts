import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import type { ConversationRecord, Speech } from "../conversation/record";
import { withImages } from "../images/images";
import { recallMemory } from "../memory/memory";
import { resolveModel } from "../model/catalog";
import { modelFailure } from "../model/failure";
import { models, sessionOptions } from "../model/models";
import { botRules } from "../rules/rules";
import { botInstructions, botTools } from "../tools";
import type { ToolContext } from "../tools/context";
import { compactTranscript } from "./compaction";
import { callEvent, usageEvent } from "./events";
import { withoutBorrowedReasoning } from "./reasoning";
import type { BotEvent, BotInfo } from "./types";

const ToolOutput = z.object({
	content: z.array(z.discriminatedUnion("type", [
		z.object({ type: z.literal("text"), text: z.string(), textSignature: z.string().optional() }),
		z.object({ type: z.literal("image"), data: z.string(), mimeType: z.string() }),
	])).nullish().transform((content) => content ?? []),
	details: z.unknown().optional(),
	usage: z.looseObject({
		input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number(), totalTokens: z.number(),
		cacheWrite1h: z.number().optional(), reasoning: z.number().optional(),
		cost: z.object({ input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number(), total: z.number() }),
	}).optional(),
	addedToolNames: z.array(z.string()).optional(),
});

interface ExecutionInput {
	bot: BotInfo;
	record: ConversationRecord;
	context: Omit<ToolContext, "speak">;
	speak: (speech: Speech) => { sent: true };
	publish: (event: BotEvent) => void;
	changed: () => void;
	approve: (call: { id: string; name: string; input: unknown }, signal?: AbortSignal) => Promise<boolean>;
}

function forceToolCall(payload: unknown, model: Model<Api>): unknown {
	if (model.api !== "openai-codex-responses" || !payload || typeof payload !== "object") {
		return undefined;
	}
	return { ...payload, tool_choice: "required" };
}

export class BotExecution {
	private readonly agent: Agent;
	private failure: string | null = null;
	private readonly controller = new AbortController();
	private readonly calls = new Map<string, string>();

	constructor(private readonly input: ExecutionInput) {
		const { bot, record, context } = input;
		this.agent = new Agent({
			streamFn: (model, window, options) => models().streamSimple(model, window, { ...options, ...sessionOptions(model, record.id) }),
			transformContext: async (window) => await withImages(context.chat.botId, withoutBorrowedReasoning(window)),
			initialState: { model: resolveModel(bot.model), thinkingLevel: bot.model.reasoning, messages: record.window, tools: botTools({ ...context, speak: (speech) => input.speak({ ...speech, id: this.invocation(speech.id), callId: speech.id }) }) },
			onPayload: forceToolCall,
			shouldStopAfterTurn: () => !!record.active?.finalSpeech,
			beforeToolCall: async ({ toolCall, args }, signal) => {
				if (record.active?.status !== "running" || !(await input.approve({ id: this.invocation(toolCall.id), name: toolCall.name, input: args }, signal))) {
					return { block: true, reason: "Esta ação foi interrompida ou não foi aprovada." };
				}
				return;
			},
		});
		this.agent.subscribe(async (event) => this.translate(event));
	}

	async run(): Promise<string | null> {
		const { bot, record } = this.input;
		this.agent.state.systemPrompt = [botInstructions(), `Seu nome é ${bot.name}.`, `# Seu propósito\n\n${bot.purpose ?? "Ainda vazio."}`, await botRules(), await recallMemory(bot.id)].filter(Boolean).join("\n\n");
		await this.compact();
		if (record.active?.status !== "running") {
			return null;
		}
		await this.agent.continue();
		return this.failure ?? (record.active?.status === "running" && !record.active.finalSpeech ? "O bot terminou sem enviar uma resposta final." : null);
	}

	cancel(): void {
		this.controller.abort();
		this.agent.abort();
	}

	private translate(event: AgentEvent): void {
		const { record, publish, changed } = this.input;
		if (event.type === "message_end" && event.message.role === "assistant") {
			this.finishMessage(event.message);
			return;
		}
		if (event.type === "tool_execution_start") {
			const call = callEvent(event.toolName, this.invocation(event.toolCallId), event.args);
			if (call && record.active?.status === "running") {
				publish(call);
			}
			return;
		}
		if (event.type === "tool_execution_end") {
			record.result({ ...ToolOutput.parse(event.result), role: "toolResult", toolName: event.toolName, toolCallId: event.toolCallId, isError: event.isError, timestamp: Date.now() }, `result:${this.invocation(event.toolCallId)}`);
			changed();
			return;
		}
	}

	private finishMessage(message: AssistantMessage): void {
		const toolIds = message.content.filter((part) => part.type === "toolCall").map((part) => part.id);
		if (new Set(toolIds).size !== toolIds.length) {
			throw new Error("O modelo repetiu identificadores de ações na mesma resposta.");
		}
		const id = this.input.record.message(message);
		this.calls.clear();
		for (const [index, part] of message.content.entries()) {
			if (part.type === "toolCall") {
				this.calls.set(part.id, `${id}:${index}`);
			}
		}
		for (const usage of usageEvent(message.usage)) {
			this.input.publish(usage);
		}
		if (message.stopReason === "error") {
			this.failure = modelFailure(message.errorMessage ?? "The model request failed.", this.input.bot.model.provider);
		}
	}

	private invocation(callId: string): string {
		const id = this.calls.get(callId);
		if (!id) {
			throw new Error("Esta ação não tem uma chamada gravada.");
		}
		return id;
	}

	private async compact(): Promise<void> {
		const compacted = await compactTranscript({ messages: this.agent.state.messages, model: this.agent.state.model, systemPrompt: this.agent.state.systemPrompt, sessionId: this.input.record.id, signal: this.controller.signal }).catch((error: unknown) => {
			if (this.controller.signal.aborted) {
				return null;
			}
			this.input.publish({ type: "warning", text: `A conversa não foi resumida: ${error instanceof Error ? error.message : String(error)}` });
			return null;
		});
		if (!compacted || this.controller.signal.aborted) {
			return;
		}
		this.input.record.compact(compacted.summary, compacted.messages.slice(1));
		this.agent.state.messages = compacted.messages;
		if (compacted.crowded) {
			this.input.publish({ type: "warning", text: compacted.crowded });
		}
		this.input.changed();
	}
}
