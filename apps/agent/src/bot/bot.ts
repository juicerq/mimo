import { Agent, calculateContextTokens, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { uuidv7, type Usage } from "@earendil-works/pi-ai";
import { archiveSession } from "../history/history";
import { LoginSession, type LoginTarget } from "../login/login";
import { contentText, isLlmMessage } from "../messages";
import { resolveModel, selectModel } from "../model/catalog";
import { models } from "../model/models";
import type { ModelSelection } from "../model/types";
import { recallMemory } from "../memory/memory";
import { botTools, needsApproval } from "../tools";
import instructions from "../instructions.md" with { type: "text" };
import { compactTranscript } from "./compaction";
import { readBot, readTranscript, writeBot, writeTranscript } from "./store";
import type { Approval, BotEvent, BotInfo, BotMode } from "./types";

const APPROVE_WORDS = new Set(["1", "approve", "aprovar", "sim", "s"]);
const DENY_WORDS = new Set(["2", "cancel", "cancelar", "não", "nao", "n"]);

const open = new Map<string, Bot>();

interface Pending {
	approval: Approval;
	resolve: (approved: boolean) => void;
}

export class Bot {
	private readonly agent: Agent;
	private readonly listeners = new Set<(event: BotEvent) => void>();
	private record: BotInfo;
	private session = uuidv7();
	private pending: Pending | null = null;

	private constructor(record: BotInfo, messages: AgentMessage[]) {
		this.record = record;
		this.agent = new Agent({
			streamFn: (model, context, options) => models().streamSimple(model, context, options),
			initialState: {
				systemPrompt: instructions,
				model: resolveModel(record.model),
				thinkingLevel: record.model.reasoning,
				messages,
				tools: botTools(this),
			},
			beforeToolCall: async ({ toolCall, args }, signal) => await this.approve(toolCall.id, toolCall.name, args, signal),
		});
		this.agent.subscribe((event) => this.translate(event));
	}

	static async open(id: string): Promise<Bot> {
		const running = open.get(id);
		if (running) {
			return running;
		}
		const record = await readBot(id);
		if (!record) {
			throw new Error("This bot no longer exists.");
		}
		const bot = new Bot(record, await readTranscript(id));
		open.set(id, bot);
		return bot;
	}

	get info(): BotInfo {
		return this.record;
	}

	get botId(): string {
		return this.record.id;
	}

	get sessionId(): string {
		return this.session;
	}

	get mode(): BotMode {
		return this.record.mode;
	}

	get approval(): Approval | null {
		return this.pending?.approval ?? null;
	}

	login(target: LoginTarget): LoginSession {
		if (this.listeners.size === 0) {
			throw new Error("Este bot não está na tela. A pessoa precisa abrir o bot na TUI para autorizar.");
		}
		const session = new LoginSession(target);
		this.emit({ type: "login", target, session });
		return session;
	}

	setMode(mode: BotMode): void {
		this.record = { ...this.record, mode };
		this.emit({ type: "mode", mode });
		void writeBot(this.record);
	}

	subscribe(listener: (event: BotEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	transcript(): BotEvent[] {
		return this.agent.state.messages.flatMap(replayMessage);
	}

	async selectModel(selection: ModelSelection): Promise<BotInfo> {
		const model = selectModel(selection);
		this.record = { ...this.record, model };
		await writeBot(this.record);
		this.agent.state.model = resolveModel(model);
		this.agent.state.thinkingLevel = model.reasoning;
		return this.record;
	}

	async deliver(text: string): Promise<void> {
		const answer = text.trim().toLowerCase();
		if (this.pending && (APPROVE_WORDS.has(answer) || DENY_WORDS.has(answer))) {
			this.pending.resolve(APPROVE_WORDS.has(answer));
			return;
		}
		await this.send(text);
	}

	async send(text: string): Promise<void> {
		this.emit({ type: "user", text });
		if (this.agent.state.isStreaming) {
			this.agent.steer({ role: "user", content: text, timestamp: Date.now() });
			return;
		}
		this.emit({ type: "turn-started" });
		this.agent.state.systemPrompt = `${instructions}\n\n${await recallMemory(this.record.id)}`;
		await this.agent.prompt(text);
	}

	cancel(): void {
		this.pending?.resolve(false);
		this.agent.abort();
	}

	private emit(event: BotEvent): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	private async approve(toolCallId: string, toolName: string, args: unknown, signal?: AbortSignal) {
		if (!needsApproval(this, toolName, args)) {
			return;
		}
		const approval: Approval = { id: toolCallId, toolName, input: args };
		const approved = await new Promise<boolean>((resolve) => {
			this.pending = { approval, resolve };
			signal?.addEventListener("abort", () => resolve(false), { once: true });
			this.emit({ type: "approval", approval });
		});
		this.pending = null;
		this.emit({ type: "approval-resolved", outcome: approved ? "approved" : "denied" });
		if (approved) {
			return;
		}
		return { block: true, reason: "A pessoa não aprovou esta ação." };
	}

	private translate(event: AgentEvent): void {
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			this.emit({ type: "reply-delta", delta: event.assistantMessageEvent.delta });
			return;
		}
		if (event.type === "message_end") {
			this.finishMessage(event.message);
			return;
		}
		if (event.type === "tool_execution_start") {
			this.emit({ type: "tool", toolName: event.toolName, input: event.args });
			return;
		}
		if (event.type === "tool_execution_end") {
			if (event.isError) {
				this.emit({ type: "tool-failed", message: toolErrorText(event.result) });
			} else {
				this.emit({ type: "tool-result", toolName: event.toolName, output: toolResultText(event.result) });
			}
			return;
		}
		if (event.type === "agent_end") {
			this.emit({ type: "turn-finished" });
			void this.settle();
		}
	}

	private finishMessage(message: AgentMessage): void {
		if (message.role !== "assistant") {
			return;
		}
		this.emit({ type: "reply", text: contentText(message.content) });
		for (const event of usageEvent(message.usage)) {
			this.emit(event);
		}
		if (message.stopReason === "aborted") {
			this.emit({ type: "turn-cancelled" });
		}
		if (message.stopReason === "error") {
			this.emit({ type: "turn-failed", message: message.errorMessage ?? "The model request failed." });
		}
	}

	private async settle(): Promise<void> {
		const compacted = await compactTranscript({ messages: this.agent.state.messages, model: this.agent.state.model })
			.catch(() => null);
		if (compacted) {
			await archiveSession({ botId: this.record.id, sessionId: this.session, messages: this.agent.state.messages });
			this.agent.state.messages = compacted;
			this.session = uuidv7();
		}
		await writeTranscript(this.record.id, this.agent.state.messages);
	}
}

function toolErrorText(result: unknown): string {
	if (result && typeof result === "object" && "content" in result && Array.isArray(result.content)) {
		return result.content.filter((part) => part.type === "text").map((part) => part.text).join("");
	}
	return "tool failed";
}

function toolResultText(result: unknown): string {
	const text = toolErrorText(result);
	if (text !== "tool failed") {
		return text;
	}
	return JSON.stringify(result) ?? "";
}

function usageEvent(usage: Usage): BotEvent[] {
	const contextTokens = calculateContextTokens(usage);
	if (contextTokens === 0) {
		return [];
	}
	return [{ type: "usage", contextTokens }];
}

function replayMessage(message: AgentMessage): BotEvent[] {
	if (!isLlmMessage(message)) {
		return [];
	}
	if (message.role === "user") {
		const text = contentText(message.content);
		if (!text) {
			return [];
		}
		return [{ type: "user", text }];
	}
	if (message.role === "toolResult") {
		if (message.isError) {
			return [{ type: "tool-failed", message: toolErrorText(message) }];
		}
		return [{ type: "tool-result", toolName: message.toolName, output: contentText(message.content) }];
	}
	const text = contentText(message.content);
	return [
		...(text ? [{ type: "reply" as const, text }] : []),
		...message.content.filter((part) => part.type === "toolCall")
			.map((part) => ({ type: "tool" as const, toolName: part.name, input: part.arguments })),
		...usageEvent(message.usage),
	];
}
