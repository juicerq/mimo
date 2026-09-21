import { Agent, type AgentEvent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { BrowserSession } from "../browser/browser";
import { browserFor, closeBrowser } from "../browser/registry";
import { saveImage, withImages, type Pasted } from "../images/images";
import type { LoginSession, LoginTarget } from "../login/login";
import { requestLogin } from "../login/registry";
import { resolveModel } from "../model/catalog";
import { modelFailure } from "../model/failure";
import { models } from "../model/models";
import { recallMemory } from "../memory/memory";
import { botRules } from "../rules/rules";
import { approvalInput } from "../gmail/tools";
import { botInstructions, botTools } from "../tools";
import { Approvals } from "./approvals";
import { compactTranscript } from "./compaction";
import { sealTranscript } from "./seal";
import { Queue } from "./queue";
import { withoutBorrowedReasoning } from "./reasoning";
import { callEvent, entryEvent, entryMessage, lastMessage, replayMessage, resultEvent, summaryStart, toolResultText, usageEvent, type Entry, type LastMessage } from "./events";
import { chatId, openOnce } from "./registry";
import { listBots, readBot, readTranscript, writeTranscript } from "./store";
import type { Approval, Ask, AskResult, BotEvent, BotInfo, ChatKey } from "./types";

const STOPPED = "O trabalho foi parado.";
const CHAIN_LIMIT = 3;

export class Chat {
	private readonly agent: Agent;
	private readonly listeners = new Set<(event: BotEvent) => void>();
	private readonly observers = new Set<(event: BotEvent) => void>();
	private readonly approvals = new Approvals((event) => this.emit(event));
	private readonly entries = new Queue((event) => this.emit(event));
	private readonly running = new Map<string, string>();
	private readonly logins = new Set<LoginSession>();
	readonly chat: ChatKey;
	private record: BotInfo;
	private archive: AgentMessage[];
	private host: Chat | null = null;
	private chain: readonly string[] = [];
	private cancelled = false;
	private draining = false;
	private reply = "";
	private failure: string | null = null;
	private writing: Promise<void> = Promise.resolve();

	private constructor(record: BotInfo, chat: ChatKey, log: AgentMessage[]) {
		const start = summaryStart(log);
		const messages = log.slice(start);

		this.chat = chat;
		this.record = record;
		this.archive = log.slice(0, start);
		this.agent = new Agent({
			streamFn: (model, context, options) => models().streamSimple(model, context, { ...options, sessionId: chatId(chat) }),
			transformContext: async (context) => await withImages(chat.botId, withoutBorrowedReasoning(context)),
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

	static async open(chat: ChatKey): Promise<Chat> {
		return await openOnce(chatId(chat), async () => {
			const record = await readBot(chat.botId);
			if (!record) {
				throw new Error("Este bot não existe mais.");
			}
			return new Chat(record, chat, sealTranscript(await readTranscript(chat)));
		});
	}

	get info(): BotInfo {
		return this.record;
	}

	get botId(): string {
		return this.record.id;
	}

	get withPerson(): boolean {
		return this.chat.askedBy === undefined;
	}

	private get log(): AgentMessage[] {
		return [...this.archive, ...this.agent.state.messages];
	}

	get busy(): boolean {
		return this.agent.state.isStreaming;
	}

	get queue(): string[] {
		return this.entries.texts;
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

	browser(): BrowserSession {
		return browserFor(this.record.id);
	}

	login(target: LoginTarget): LoginSession {
		const session = requestLogin(target);
		this.logins.add(session);
		void session.finished.catch(() => {}).finally(() => this.logins.delete(session));
		this.screen()?.emit({ type: "login", target, session });
		return session;
	}

	async ask(ask: Ask, signal?: AbortSignal): Promise<AskResult> {
		const target = await this.named(ask.bot);
		const chain = [...this.chain, this.record.id];
		if (chain.includes(target.id)) {
			throw new Error(`${target.name} está esperando uma resposta sua. Responda com o que você sabe em vez de perguntar de volta.`);
		}
		if (chain.length > CHAIN_LIMIT) {
			throw new Error("Esta pergunta já passou por bots demais. Responda com o que você sabe.");
		}
		const peer = await Chat.open({ botId: target.id, askedBy: this.record.id });
		peer.host = this;
		peer.chain = chain;
		if (ask.wait) {
			return { bot: target.name, reply: await peer.answer(this.record.name, ask.prompt, signal) };
		}
		void this.relay(peer, target.name, ask.prompt);
		return { bot: target.name, status: "perguntei" };
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

	adopt(record: BotInfo): void {
		this.record = record;
		this.agent.state.model = resolveModel(record.model);
		this.agent.state.thinkingLevel = record.model.reasoning;
	}

	resolveApproval(id: string, approved: boolean): void {
		if (!this.approvals.resolve(id, approved)) {
			throw new Error("Este pedido de confirmação já não está aberto.");
		}
	}

	async send(text: string, pasted: readonly Pasted[] = []): Promise<void> {
		const images = await this.keep(pasted);
		await this.push({ text, kind: "user", images });
	}

	private async keep(pasted: readonly Pasted[]): Promise<string[]> {
		if (pasted.length === 0) {
			return [];
		}
		if (!this.agent.state.model.input.includes("image")) {
			throw new Error(`${this.record.model.name} não lê imagem. Escolha outro modelo em Sobre o bot.`);
		}
		return await Promise.all(pasted.map(async (image) => await saveImage(this.record.id, image)));
	}

	async runRoutine(routine: { name: string; prompt: string }): Promise<void> {
		raise(await this.push({ kind: "routine", name: routine.name, text: routine.prompt }));
	}

	cancel(): void {
		this.cancelled = true;
		this.running.clear();
		this.entries.discard(this.outcome());
		this.approvals.denyAll();
		for (const session of this.logins) {
			session.cancel();
		}
		closeBrowser(this.record.id);
		this.agent.abort();
	}

	private async named(name: string): Promise<BotInfo> {
		const found = (await listBots()).find((bot) => bot.name.toLowerCase() === name.trim().toLowerCase());
		if (!found) {
			throw new Error(`Não existe um bot chamado ${name}. Veja os nomes com list_bots.`);
		}
		if (found.id === this.record.id) {
			throw new Error("Este é você mesmo.");
		}
		return found;
	}

	private async answer(from: string, prompt: string, signal?: AbortSignal): Promise<string> {
		const ran = this.push({ kind: "ask", peer: from, text: prompt });
		raise(await (signal ? Promise.race([ran, aborted(signal)]) : ran));
		if (!this.reply) {
			throw new Error(`${this.record.name} terminou sem responder.`);
		}
		return this.reply;
	}

	private async relay(peer: Chat, name: string, prompt: string): Promise<void> {
		const answer = await peer.answer(this.record.name, prompt).then(
			(text) => ({ text, failed: false }),
			(error: unknown) => ({ text: errorText(error), failed: true }),
		);
		await this.push({ ...answer, kind: "answer", peer: name });
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
			this.reply = "";
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

	private screen(): Chat | null {
		if (this.listeners.size > 0) {
			return this;
		}
		return this.host?.screen() ?? null;
	}

	private origin(): Chat {
		return this.host?.origin() ?? this;
	}

	private async systemPrompt(): Promise<string> {
		return [this.basePrompt(), await botRules(), await recallMemory(this.record.id)].filter(Boolean).join("\n\n");
	}

	private basePrompt(): string {
		const parts = [botInstructions(), `Seu nome é ${this.record.name}.`];
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
		const asking = approvalInput(toolName, args);
		if (!asking) {
			return;
		}
		const approved = await this.origin().approvals.ask({ id: toolCallId, bot: this.record.name, toolName, input: asking.input }, signal);
		if (approved) {
			return;
		}
		return { block: true, reason: "A pessoa não aprovou esta ação." };
	}

	private translate(event: AgentEvent): void {
		if (event.type === "message_end") {
			this.finishMessage(event.message);
			this.keepLog();
			return;
		}
		if (event.type === "tool_execution_start") {
			this.running.set(event.toolCallId, event.toolName);
			if (this.cancelled) {
				return;
			}
			const call = callEvent(event.toolName, event.toolCallId, event.args);
			if (call.type === "reply") {
				this.reply = call.text;
			}
			this.emit(call);
			return;
		}
		if (event.type === "tool_execution_end") {
			this.running.delete(event.toolCallId);
			this.keepLog();
			if (this.cancelled) {
				return;
			}
			const tool = { id: event.toolCallId, toolName: event.toolName };
			for (const result of resultEvent(tool, toolResultText(event.result), event.isError)) {
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
			sessionId: chatId(this.chat),
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
		this.writing = this.writing.catch(() => {}).then(async () => await writeTranscript(this.chat, this.log));
		await this.writing.catch((error: unknown) => {
			throw new Error(`A conversa não foi gravada: ${errorText(error)}`);
		});
	}
}

function aborted(signal: AbortSignal): Promise<string> {
	if (signal.aborted) {
		return Promise.resolve(STOPPED);
	}
	return new Promise((resolve) => {
		signal.addEventListener("abort", () => resolve(STOPPED), { once: true });
	});
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
