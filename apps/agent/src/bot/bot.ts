import { Agent, calculateContextTokens, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { uuidv7, type Usage } from "@earendil-works/pi-ai";
import { archiveSession } from "../history/history";
import { LoginSession, type LoginTarget } from "../login/login";
import { contentText, isLlmMessage } from "../messages";
import { resolveModel, selectModel } from "../model/catalog";
import { models } from "../model/models";
import type { ModelSelection } from "../model/types";
import { recallMemory } from "../memory/memory";
import { isTeamCall, teamCall } from "../team/tools";
import { botInstructions, botTools, needsApproval } from "../tools";
import { toolWarning } from "../tools/tool";
import { compactTranscript } from "./compaction";
import { deleteBotRoutines } from "../routines/routines";
import { listChildren, readBot, readTranscript, removeBot, writeBot, writeTranscript, type BotPatch } from "./store";
import type { Approval, BotEvent, BotInfo, BotMode, TeamMember, ToolGroup } from "./types";

const APPROVE_WORDS = new Set(["1", "approve", "aprovar", "sim", "s"]);
const DENY_WORDS = new Set(["2", "cancel", "cancelar", "não", "nao", "n"]);

const open = new Map<string, Bot>();

interface Pending {
	approval: Approval;
	resolve: (approved: boolean) => void;
}

type Entry =
	| { kind: "user"; text: string }
	| { kind: "note"; text: string }
	| { kind: "routine"; name: string; text: string };

const NOTE_MARK = "[equipe]";
const ROUTINE_MARK = /^\[rotina(?:: (?<name>[^\]\n]+))?\]\n/u;

export async function deleteBot(id: string): Promise<void> {
	for (const child of await listChildren(id)) {
		await deleteBot(child.id);
	}
	const running = open.get(id);
	running?.cancel();
	open.delete(id);
	await deleteBotRoutines(id);
	await removeBot(id);
}

export class Bot {
	private readonly agent: Agent;
	private readonly listeners = new Set<(event: BotEvent) => void>();
	private readonly approvals: Pending[] = [];
	private readonly queued: Entry[] = [];
	private readonly crew = new Map<Bot, number>();
	private readonly running = new Map<string, string>();
	private record: BotInfo;
	private session = uuidv7();
	private host: Bot | null = null;
	private cancelled = false;
	private draining = false;
	private reply = "";
	private failure: string | null = null;

	private constructor(record: BotInfo, messages: AgentMessage[]) {
		this.record = record;
		this.agent = new Agent({
			streamFn: (model, context, options) => models().streamSimple(model, context, options),
			initialState: {
				systemPrompt: this.basePrompt(),
				model: resolveModel(record.model),
				thinkingLevel: record.model.reasoning,
				messages,
				tools: botTools(this),
			},
			steeringMode: "all",
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
		return this.host?.mode ?? this.record.mode;
	}

	get busy(): boolean {
		return this.agent.state.isStreaming;
	}

	get parentId(): string | undefined {
		return this.record.parentId;
	}

	get tools(): ToolGroup[] {
		return this.record.tools;
	}

	get queue(): string[] {
		return this.queued.filter((entry) => entry.kind === "user").map((entry) => entry.text);
	}

	get team(): TeamMember[] {
		const members: TeamMember[] = [];
		for (const [bot, startedAt] of this.crew) {
			members.push({ name: bot.record.name, tool: bot.tool, startedAt });
		}
		return members;
	}

	get approval(): Approval | null {
		return this.approvals[0]?.approval ?? null;
	}

	private get tool(): string | null {
		let last: string | null = null;
		for (const name of this.running.values()) {
			last = name;
		}
		return last;
	}

	login(target: LoginTarget): LoginSession {
		const screen = this.screen();
		if (!screen) {
			throw new Error("Este bot não está na tela. A pessoa precisa abrir o bot na TUI para autorizar.");
		}
		const session = new LoginSession(target);
		screen.emit({ type: "login", target, session });
		return session;
	}

	async setMode(mode: BotMode): Promise<void> {
		await this.save({ mode });
		this.emit({ type: "mode", mode });
	}

	async setTools(tools: ToolGroup[]): Promise<BotInfo> {
		const record = await this.save({ tools });
		this.agent.state.tools = botTools(this);
		this.emit({ type: "tools", tools });
		return record;
	}

	async delegate(botId: string, prompt: string): Promise<void> {
		await this.child(botId);
		const child = await Bot.open(botId);
		if (child.busy) {
			throw new Error("Este filho está trabalhando. Espere ele terminar.");
		}
		child.host = this;
		this.crew.set(child, Date.now());
		void this.work(child, prompt);
	}

	stopChild(botId: string): string {
		for (const child of this.crew.keys()) {
			if (child.record.id === botId) {
				child.cancel();
				return child.record.name;
			}
		}
		throw new Error("Este filho não está trabalhando.");
	}

	async updateChild(botId: string, patch: BotPatch): Promise<BotInfo> {
		const child = await this.child(botId);
		const running = open.get(botId);
		if (running?.busy) {
			throw new Error("Este filho está trabalhando. Espere ele terminar.");
		}
		const updated = { ...child, ...patch };
		await writeBot(updated);
		running?.adopt(updated);
		return updated;
	}

	async deleteChild(botId: string): Promise<void> {
		await this.child(botId);
		await deleteBot(botId);
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
		const record = await this.save({ model });
		this.agent.state.model = resolveModel(model);
		this.agent.state.thinkingLevel = model.reasoning;
		return record;
	}

	async deliver(text: string): Promise<void> {
		const answer = text.trim().toLowerCase();
		const pending = this.approvals[0];
		if (pending && (APPROVE_WORDS.has(answer) || DENY_WORDS.has(answer))) {
			this.resolveApproval(pending, APPROVE_WORDS.has(answer));
			return;
		}
		await this.send(text);
	}

	async send(text: string): Promise<void> {
		await this.push({ text, kind: "user" });
	}

	async runRoutine(routine: { name: string; prompt: string }): Promise<void> {
		await this.push({ kind: "routine", name: routine.name, text: routine.prompt });
	}

	cancel(): void {
		this.cancelled = true;
		this.running.clear();
		this.discard();
		for (const pending of this.approvals.slice()) {
			this.resolveApproval(pending, false);
		}
		this.agent.abort();
	}

	private async work(child: Bot, prompt: string): Promise<void> {
		const note = await child.run(prompt).then(
			(reply) => `O filho ${child.record.name} terminou e respondeu:\n\n${reply}`,
			(error: unknown) => `O filho ${child.record.name} não terminou: ${errorText(error)}`,
		);
		this.crew.delete(child);
		await this.push({ text: note, kind: "note" });
	}

	private async push(entry: Entry): Promise<void> {
		this.queued.push(entry);
		this.emit({ type: "queue", items: this.queue });
		await this.drain();
	}

	private steerQueue(): void {
		for (const entry of this.take()) {
			this.announce(entry);
			this.agent.steer(entryMessage(entry));
		}
	}

	private take(): Entry[] {
		if (this.queued.length === 0) {
			return [];
		}
		const pending = this.queued.splice(0, this.queued.length);
		this.emit({ type: "queue", items: [] });
		return pending;
	}

	private discard(): void {
		const kept = this.queued.filter((entry) => entry.kind === "note");
		this.queued.splice(0, this.queued.length, ...kept);
		this.emit({ type: "queue", items: this.queue });
	}

	private announce(entry: Entry): void {
		this.emit(entryEvent(entry));
	}

	private async drain(): Promise<void> {
		if (this.draining || this.agent.state.isStreaming) {
			return;
		}
		const batch = this.take();
		if (batch.length === 0) {
			return;
		}
		this.draining = true;
		try {
			this.cancelled = false;
			for (const entry of batch) {
				this.announce(entry);
			}
			this.emit({ type: "turn-started" });
			this.agent.state.systemPrompt = `${this.basePrompt()}\n\n${await recallMemory(this.record.id)}`;
			const run = this.agent.prompt(batch.map(entryMessage));
			this.draining = false;
			await run;
		} finally {
			this.draining = false;
		}
	}

	private async finish(): Promise<void> {
		await this.settle();
		await this.drain();
	}

	private async run(prompt: string): Promise<string> {
		if (this.busy) {
			throw new Error("Este filho está trabalhando. Espere ele terminar.");
		}
		this.failure = null;
		await this.send(prompt);
		if (this.failure !== null) {
			throw new Error(this.failure);
		}
		if (this.cancelled) {
			throw new Error("O trabalho foi parado.");
		}
		return this.reply;
	}

	private async save(change: Partial<BotInfo>): Promise<BotInfo> {
		const record = { ...this.record, ...change };
		await writeBot(record);
		this.record = record;
		return record;
	}

	private adopt(record: BotInfo): void {
		this.record = record;
		this.agent.state.model = resolveModel(record.model);
		this.agent.state.thinkingLevel = record.model.reasoning;
		this.agent.state.tools = botTools(this);
	}

	private screen(): Bot | null {
		if (this.listeners.size > 0) {
			return this;
		}
		return this.host?.screen() ?? null;
	}

	private async child(botId: string): Promise<BotInfo> {
		const child = await readBot(botId);
		if (child?.parentId !== this.record.id) {
			throw new Error("Este bot não é da sua equipe.");
		}
		return child;
	}

	private basePrompt(): string {
		const parts = [botInstructions(this)];
		if (this.record.prompt) {
			parts.push(this.record.prompt);
		}
		return parts.join("\n\n");
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
		const screen = this.screen();
		if (!screen) {
			return { block: true, reason: "Ninguém está com este bot na tela para aprovar esta ação." };
		}
		const approved = await screen.ask({ id: toolCallId, bot: this.record.name, toolName, input: args }, signal);
		if (approved) {
			return;
		}
		return { block: true, reason: "A pessoa não aprovou esta ação." };
	}

	private ask(approval: Approval, signal?: AbortSignal): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			const pending: Pending = { approval, resolve };
			this.approvals.push(pending);
			signal?.addEventListener("abort", () => this.resolveApproval(pending, false), { once: true });
			if (this.approvals[0] === pending) {
				this.emit({ type: "approval", approval });
			}
		});
	}

	private resolveApproval(pending: Pending, approved: boolean): void {
		const index = this.approvals.indexOf(pending);
		if (index === -1) {
			return;
		}
		this.approvals.splice(index, 1);
		pending.resolve(approved);
		this.emit({ type: "approval-resolved", outcome: approved ? "approved" : "denied" });
		const next = this.approvals[0];
		if (next) {
			this.emit({ type: "approval", approval: next.approval });
		}
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
			this.running.set(event.toolCallId, event.toolName);
			if (!isTeamCall(event.toolName)) {
				this.emit({ type: "tool", toolName: event.toolName, input: event.args });
			}
			return;
		}
		if (event.type === "tool_execution_end") {
			this.running.delete(event.toolCallId);
			if (this.cancelled) {
				return;
			}
			if (event.isError) {
				this.emit({ type: "tool-failed", message: toolErrorText(event.result) });
				return;
			}
			for (const result of resultEvent(event.toolName, toolResultText(event.result))) {
				this.emit(result);
			}
			return;
		}
		if (event.type === "turn_end") {
			this.steerQueue();
			return;
		}
		if (event.type === "agent_end") {
			this.emit({ type: "turn-finished" });
			void this.finish().catch((error: unknown) => {
				this.emit({ type: "turn-failed", message: errorText(error) });
			});
		}
	}

	private finishMessage(message: AgentMessage): void {
		if (message.role !== "assistant") {
			return;
		}
		this.reply = contentText(message.content);
		this.emit({ type: "reply", text: this.reply });
		for (const event of usageEvent(message.usage)) {
			this.emit(event);
		}
		if (this.cancelled || message.stopReason === "aborted") {
			this.emit({ type: "turn-cancelled" });
			return;
		}
		if (message.stopReason === "error") {
			this.failure = message.errorMessage ?? "The model request failed.";
			this.emit({ type: "turn-failed", message: this.failure });
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
		await writeTranscript(this.record.id, this.agent.state.messages).catch((error: unknown) => {
			throw new Error(`A conversa não foi gravada: ${errorText(error)}`);
		});
	}
}

function entryMessage(entry: Entry): AgentMessage {
	return { role: "user", content: entryContent(entry), timestamp: Date.now() };
}

function entryContent(entry: Entry): string {
	if (entry.kind === "routine") {
		return `[rotina: ${entry.name}]\n${entry.text}`;
	}
	if (entry.kind === "note") {
		return `${NOTE_MARK}\n${entry.text}`;
	}
	return entry.text;
}

function entryEvent(entry: Entry): BotEvent {
	if (entry.kind === "routine") {
		return { type: "routine", name: entry.name, prompt: entry.text };
	}
	if (entry.kind === "note") {
		return { type: "note", text: entry.text };
	}
	return { type: "user", text: entry.text };
}

function entryOf(text: string): Entry {
	const routine = ROUTINE_MARK.exec(text);
	if (routine) {
		return { kind: "routine", name: routine.groups?.name ?? "rotina", text: text.slice(routine[0].length) };
	}
	if (text.startsWith(`${NOTE_MARK}\n`)) {
		return { kind: "note", text: text.slice(NOTE_MARK.length + 1) };
	}
	return { kind: "user", text };
}

function resultEvent(toolName: string, output: string): BotEvent[] {
	const call = teamCall(toolName, output);
	if (call) {
		return [{ type: "team-call", call }];
	}
	const warning = toolWarning(output);

	return [
		...warning ? [{ type: "tool-warned" as const, message: warning }] : [],
		{ type: "tool-result", toolName, output },
	];
}

function errorText(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
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
		return [entryEvent(entryOf(text))];
	}
	if (message.role === "toolResult") {
		if (message.isError) {
			return [{ type: "tool-failed", message: toolErrorText(message) }];
		}
		return resultEvent(message.toolName, contentText(message.content));
	}
	const text = contentText(message.content);
	return [
		...(text ? [{ type: "reply" as const, text }] : []),
		...message.content.filter((part) => part.type === "toolCall")
			.filter((part) => !isTeamCall(part.name))
			.map((part) => ({ type: "tool" as const, toolName: part.name, input: part.arguments })),
		...usageEvent(message.usage),
	];
}
