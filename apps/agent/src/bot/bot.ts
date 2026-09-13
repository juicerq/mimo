import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { uuidv7 } from "@earendil-works/pi-ai";
import { archiveSession } from "../history/history";
import { LoginSession, type LoginTarget } from "../login/login";
import { contentText } from "../messages";
import { resolveModel, selectModel } from "../model/catalog";
import { modelFailure } from "../model/failure";
import { models } from "../model/models";
import type { ModelSelection } from "../model/types";
import { recallMemory } from "../memory/memory";
import { isTeamCall } from "../team/tools";
import { botInstructions, botTools, needsApproval } from "../tools";
import { Approvals } from "./approvals";
import { compactTranscript } from "./compaction";
import { entryEvent, entryMessage, replayMessage, resultEvent, toolErrorText, toolResultText, usageEvent, type Entry } from "./events";
import { deleteBot, runningBot, trackBot } from "./registry";
import { readBot, readTranscript, writeBot, writeTranscript, type BotPatch } from "./store";
import type { Approval, BotEvent, BotInfo, BotMode, Delegation, TeamMember, ToolGroup } from "./types";

interface Work {
	task: string;
	worktree: string | null;
	startedAt: number;
}

interface Queued {
	entry: Entry;
	done: (failure: string | null) => void;
}

const STOPPED = "O trabalho foi parado.";

export class Bot {
	private readonly agent: Agent;
	private readonly listeners = new Set<(event: BotEvent) => void>();
	private readonly approvals = new Approvals((event) => this.emit(event));
	private readonly queued: Queued[] = [];
	private readonly settling: Queued[] = [];
	private readonly crew = new Map<Bot, Work>();
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
		const running = runningBot(id);
		if (running) {
			return running;
		}
		const record = await readBot(id);
		if (!record) {
			throw new Error("This bot no longer exists.");
		}
		const bot = new Bot(record, await readTranscript(id));
		trackBot(bot);
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
		return this.queued.filter((item) => item.entry.kind === "user").map((item) => item.entry.text);
	}

	get team(): TeamMember[] {
		const members: TeamMember[] = [];
		for (const [bot, work] of this.crew) {
			members.push({ name: bot.record.name, task: work.task, worktree: work.worktree, tool: bot.tool, startedAt: work.startedAt });
		}
		return members;
	}

	get approval(): Approval | null {
		return this.approvals.current;
	}

	get failed(): string | null {
		return this.failure;
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

	async delegate(delegation: Delegation): Promise<void> {
		await this.child(delegation.botId);
		const child = await Bot.open(delegation.botId);
		if (child.busy) {
			throw new Error("Este filho está trabalhando. Espere ele terminar.");
		}
		child.host = this;
		this.crew.set(child, { task: delegation.task, worktree: delegation.worktree ?? null, startedAt: Date.now() });
		void this.work(child, delegation);
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
		const running = runningBot(botId);
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
		if (this.approvals.answer(text)) {
			return;
		}
		await this.send(text);
	}

	async send(text: string): Promise<void> {
		await this.push({ text, kind: "user" });
	}

	async runRoutine(routine: { name: string; prompt: string }): Promise<void> {
		raise(await this.push({ kind: "routine", name: routine.name, text: routine.prompt }));
	}

	cancel(): void {
		this.cancelled = true;
		this.running.clear();
		this.discard();
		this.approvals.denyAll();
		this.agent.abort();
	}

	private async work(child: Bot, delegation: Delegation): Promise<void> {
		const note = await child.run(delegation.prompt).then(
			(reply) => `${child.record.name} finished · ${delegation.task}\n\n${reply}`,
			(error: unknown) => `${child.record.name} failed · ${delegation.task}\n\n${errorText(error)}`,
		);
		this.crew.delete(child);
		await this.push({ text: note, kind: "note" });
	}

	private async push(entry: Entry): Promise<string | null> {
		const ran = new Promise<string | null>((done) => {
			this.queued.push({ entry, done });
		});
		this.emit({ type: "queue", items: this.queue });
		await this.drain();
		return await ran;
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
		this.settling.push(...pending);
		this.emit({ type: "queue", items: [] });
		return pending.map((item) => item.entry);
	}

	private settleQueue(): void {
		const failure = this.outcome();
		for (const item of this.settling.splice(0, this.settling.length)) {
			item.done(failure);
		}
	}

	private outcome(): string | null {
		if (this.failure !== null) {
			return this.failure;
		}
		if (this.cancelled) {
			return STOPPED;
		}
		return null;
	}

	private discard(): void {
		const dropped = this.queued.filter((item) => item.entry.kind !== "note");
		const kept = this.queued.filter((item) => item.entry.kind === "note");
		this.queued.splice(0, this.queued.length, ...kept);
		const failure = this.outcome();
		for (const item of dropped) {
			item.done(failure);
		}
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
			this.failure = null;
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
			this.settleQueue();
		}
	}

	private async finish(): Promise<void> {
		await this.saveTranscript();
		await this.drain();
	}

	private async run(prompt: string): Promise<string> {
		if (this.busy) {
			throw new Error("Este filho está trabalhando. Espere ele terminar.");
		}
		raise(await this.push({ text: prompt, kind: "user" }));
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

	private commander(): Bot {
		return this.host?.commander() ?? this;
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
		const approved = await this.commander().approvals.ask({ id: toolCallId, bot: this.record.name, toolName, input: args }, signal);
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
				this.failure = errorText(error);
				this.emit({ type: "turn-failed", message: this.failure });
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
			this.failure = modelFailure(message.errorMessage ?? "The model request failed.", this.record.model.provider);
			this.emit({ type: "turn-failed", message: this.failure });
		}
	}

	private async saveTranscript(): Promise<void> {
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

function raise(failure: string | null): void {
	if (failure !== null) {
		throw new Error(failure);
	}
}

function errorText(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
