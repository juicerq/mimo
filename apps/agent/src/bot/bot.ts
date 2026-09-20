import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { LoginSession, type LoginTarget } from "../login/login";
import { contentText } from "../messages";
import { resolveModel, selectModel } from "../model/catalog";
import { modelFailure } from "../model/failure";
import { models } from "../model/models";
import type { ModelSelection } from "../model/types";
import { recallMemory } from "../memory/memory";
import { isTeamCall } from "../team/tools";
import { resolveFolder } from "../computer/folder";
import { botRules } from "../rules/rules";
import { APPROVAL_TOOLS } from "../gmail/tools";
import { botInstructions, botTools } from "../tools";
import { Approvals } from "./approvals";
import { compactTranscript } from "./compaction";
import { sealTranscript } from "./seal";
import { Queue } from "./queue";
import { withoutBorrowedReasoning } from "./reasoning";
import { entryEvent, entryMessage, lastMessage, replayMessage, resultEvent, summaryStart, toolErrorText, toolResultText, usageEvent, type Entry, type LastMessage } from "./events";
import { deleteBot, openOnce, runningBot } from "./registry";
import { readBot, readTranscript, writeBot, writeTranscript, type BotPatch } from "./store";
import type { Approval, BotEvent, BotInfo, Delegation, TeamMember, ToolGroup } from "./types";

interface Work {
	task: string;
	startedAt: number;
}

const STOPPED = "O trabalho foi parado.";

export class Bot {
	private readonly agent: Agent;
	private readonly listeners = new Set<(event: BotEvent) => void>();
	private readonly observers = new Set<(event: BotEvent) => void>();
	private readonly approvals = new Approvals((event) => this.emit(event));
	private readonly entries = new Queue((event) => this.emit(event));
	private readonly crew = new Map<Bot, Work>();
	private readonly running = new Map<string, string>();
	private record: BotInfo;
	private archive: AgentMessage[];
	private host: Bot | null = null;
	private cancelled = false;
	private draining = false;
	private reply = "";
	private failure: string | null = null;
	private writing: Promise<void> = Promise.resolve();

	private constructor(record: BotInfo, log: AgentMessage[]) {
		const start = summaryStart(log);
		const messages = log.slice(start);

		this.record = record;
		this.archive = log.slice(0, start);
		this.agent = new Agent({
			streamFn: (model, context, options) => models().streamSimple(model, context, { ...options, sessionId: record.id }),
			transformContext: async (context) => withoutBorrowedReasoning(context),
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
		return await openOnce(id, async () => {
			const record = await readBot(id);
			if (!record) {
				throw new Error("This bot no longer exists.");
			}
			return new Bot(record, sealTranscript(await readTranscript(id)));
		});
	}

	get info(): BotInfo {
		return this.record;
	}

	get botId(): string {
		return this.record.id;
	}

	private get log(): AgentMessage[] {
		return [...this.archive, ...this.agent.state.messages];
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

	get folder(): string | undefined {
		return this.record.folder;
	}

	get queue(): string[] {
		return this.entries.texts;
	}

	get team(): TeamMember[] {
		const members: TeamMember[] = [];
		for (const [bot, work] of this.crew) {
			members.push({ name: bot.record.name, task: work.task, worktree: bot.record.branch ?? null, tool: bot.tool, startedAt: work.startedAt });
		}
		return members;
	}

	get approval(): Approval | null {
		return this.approvals.current;
	}

	get lastMessage(): LastMessage | null {
		return lastMessage(this.agent.state.messages) ?? lastMessage(this.archive);
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

	async setTools(tools: ToolGroup[]): Promise<BotInfo> {
		const record = await this.save({ tools });
		this.agent.state.tools = botTools(this);
		this.emit({ type: "tools", tools });
		return record;
	}

	async setFolder(folder: string | undefined): Promise<BotInfo> {
		const record = await this.save({ folder: folder === undefined ? undefined : await resolveFolder(folder) });
		this.agent.state.tools = botTools(this);
		return record;
	}

	async delegate(delegation: Delegation): Promise<void> {
		await this.child(delegation.botId);
		const child = await Bot.open(delegation.botId);
		if (child.busy) {
			throw new Error("Este filho está trabalhando. Espere ele terminar.");
		}
		child.host = this;
		this.crew.set(child, { task: delegation.task, startedAt: Date.now() });
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

	async deleteChild(botId: string, discard: boolean): Promise<void> {
		await this.child(botId);
		await deleteBot(botId, "tool", discard);
	}

	subscribe(listener: (event: BotEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	observe(observer: (event: BotEvent) => void): () => void {
		this.observers.add(observer);
		return () => this.observers.delete(observer);
	}

	transcript(): BotEvent[] {
		return this.log.flatMap(replayMessage);
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

	resolveApproval(approved: boolean): void {
		if (!this.approvals.resolve(approved)) {
			throw new Error("Este bot não está esperando confirmação.");
		}
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
		this.entries.discard(this.outcome());
		this.approvals.denyAll();
		this.agent.abort();
	}

	private async work(child: Bot, delegation: Delegation): Promise<void> {
		const note = await child.run(delegation.prompt).then(
			(reply) => ({ short: `${child.record.name} finished · ${delegation.task}`, text: reply }),
			(error: unknown) => ({ short: `${child.record.name} failed · ${delegation.task}`, text: errorText(error) }),
		);
		this.crew.delete(child);
		await this.push({ ...note, kind: "note" });
	}

	private async push(entry: Entry): Promise<string | null> {
		const ran = this.entries.add(entry);
		await this.drain();
		return await ran;
	}

	private steerQueue(): void {
		for (const entry of this.entries.take()) {
			this.announce(entry);
			this.agent.steer(entryMessage(entry));
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

	private announce(entry: Entry): void {
		this.emit(entryEvent(entry));
	}

	private async drain(): Promise<void> {
		if (this.draining || this.agent.state.isStreaming) {
			return;
		}
		const batch = this.entries.take();
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
			this.agent.state.systemPrompt = await this.systemPrompt();
			await this.compact();
			const run = this.agent.prompt(batch.map(entryMessage));
			this.draining = false;
			await run;
		} finally {
			this.draining = false;
			this.entries.settle(this.outcome());
		}
	}

	private async finish(): Promise<void> {
		await this.writeLog();
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

	private async systemPrompt(): Promise<string> {
		const rules = await botRules(this.record.folder);
		return [this.basePrompt(), rules, await recallMemory(this.record.id)].filter(Boolean).join("\n\n");
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
		for (const observer of this.observers) {
			observer(event);
		}
	}

	private async approve(toolCallId: string, toolName: string, args: unknown, signal?: AbortSignal) {
		if (!APPROVAL_TOOLS.has(toolName)) {
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
			this.keepLog();
			return;
		}
		if (event.type === "tool_execution_start") {
			this.running.set(event.toolCallId, event.toolName);
			if (!isTeamCall(event.toolName)) {
				this.emit({ type: "tool", id: event.toolCallId, toolName: event.toolName, input: event.args });
			}
			return;
		}
		if (event.type === "tool_execution_end") {
			this.running.delete(event.toolCallId);
			this.keepLog();
			if (this.cancelled) {
				return;
			}
			const tool = { id: event.toolCallId, toolName: event.toolName };
			if (event.isError) {
				this.emit({ type: "tool-failed", ...tool, message: toolErrorText(event.result) });
				return;
			}
			for (const result of resultEvent(tool, toolResultText(event.result))) {
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

	private async compact(): Promise<void> {
		const compacted = await compactTranscript({
			messages: this.agent.state.messages,
			model: this.agent.state.model,
			systemPrompt: this.agent.state.systemPrompt,
			sessionId: this.record.id,
		})
			.catch((error: unknown) => {
				this.emit({ type: "warning", text: `A conversa não foi resumida: ${errorText(error)}` });
				return null;
			});
		if (!compacted) {
			return;
		}
		if (compacted.crowded) {
			this.emit({ type: "warning", text: compacted.crowded });
		}
		this.archive = [...this.archive, ...compacted.dropped];
		this.agent.state.messages = compacted.messages;
		this.emit(entryEvent({ kind: "summary", text: compacted.summary }));
		await this.writeLog();
	}

	private keepLog(): void {
		void this.writeLog().catch((error: unknown) => {
			this.emit({ type: "warning", text: errorText(error) });
		});
	}

	private async writeLog(): Promise<void> {
		this.writing = this.writing.catch(() => {}).then(async () => await writeTranscript(this.record.id, this.log));
		await this.writing.catch((error: unknown) => {
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
