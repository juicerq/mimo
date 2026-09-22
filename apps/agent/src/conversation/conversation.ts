import { randomUUID } from "node:crypto";
import { Approvals } from "../bot/approvals";
import { BotExecution } from "../bot/execution";
import { type Entry } from "../bot/events";
import { openOnce } from "../bot/registry";
import { listBots, readBot } from "../bot/store";
import type { Ask, AskResult, BotEvent, BotInfo, ChatKey, Interruption } from "../bot/types";
import { browserFor, closeBrowser } from "../browser/registry";
import { approvalInput } from "../gmail/tools";
import { saveImage, type Pasted } from "../images/images";
import { requestLogin } from "../login/registry";
import type { LoginSession, LoginTarget } from "../login/login";
import { resolveModel } from "../model/catalog";
import { ConversationRecord, conversationId, type ConversationBatch } from "./record";

const CHAIN_LIMIT = 3;

export class Conversation {
	private readonly record: ConversationRecord;
	private readonly watchers = new Set<() => void>();
	private readonly approvals = new Approvals((event) => this.publish(event));
	private readonly logins = new Set<LoginSession>();
	private readonly peers = new Map<Conversation, string>();
	private request: string | null = null;
	private execution: BotExecution | null = null;
	private running: Promise<void> | null = null;
	private accepting: Promise<void> = Promise.resolve();
	private stopped = 0;
	private closed = false;
	private fault: Error | null = null;
	private host: Conversation | null = null;
	private chain: readonly string[] = [];

	private constructor(private bot: BotInfo, readonly chat: ChatKey) {
		this.record = new ConversationRecord(chat);
		this.record.recover();
		this.record.seal();
	}

	static async open(chat: ChatKey): Promise<Conversation> {
		return await openOnce(conversationId(chat), async () => {
			const bot = await readBot(chat.botId);
			if (!bot) {
				throw new Error("Este bot não existe mais.");
			}
			return new Conversation(bot, chat);
		});
	}

	get info(): BotInfo { return this.bot; }
	get botId(): string { return this.bot.id; }
	get withPerson(): boolean { return this.chat.askedBy === undefined; }
	get busy(): boolean { return this.record.active !== undefined; }
	get approval() { return this.approvals.current; }
	get lastMessage() { return this.record.lastMessage; }
	get failed(): string | null { return this.fault?.message ?? this.record.latest?.failure ?? null; }

	adopt(bot: BotInfo): void {
		this.bot = bot;
	}

	async *watch(signal?: AbortSignal): AsyncGenerator<ConversationBatch> {
		this.assertOpen();
		const snapshot = this.record.snapshot();
		let cursor = snapshot.cursor;
		yield snapshot;
		while (!signal?.aborted) {
			this.assertOpen();
			const wake = Promise.withResolvers<void>();
			const changed = () => {
				this.watchers.delete(changed);
				wake.resolve();
			};
			this.watchers.add(changed);
			signal?.addEventListener("abort", changed, { once: true });
			try {
				const rows = this.record.since(cursor);
				if (rows.length) {
					cursor = rows.at(-1)?.seq ?? cursor;
					yield { reset: false, cursor, events: rows.map((row) => row.event) };
				} else {
					await wake.promise;
				}
			} finally {
				this.watchers.delete(changed);
				signal?.removeEventListener("abort", changed);
			}
		}
	}

	async send(id: string, text: string, pasted: readonly Pasted[]): Promise<void> {
		if (pasted.length && !resolveModel(this.bot.model).input.includes("image")) {
			throw new Error(`${this.bot.model.name} não lê imagem. Escolha outro modelo em Sobre o bot.`);
		}
		const images = await Promise.all(pasted.map(async (image) => await saveImage(this.bot.id, image)));
		await this.submit({ id, entry: { kind: "user", text, images } });
	}

	async runRoutine(routine: { name: string; prompt: string; id?: string }): Promise<boolean> {
		const id = routine.id ?? randomUUID();
		const turnId = await this.submit({ id, entry: { kind: "routine", name: routine.name, text: routine.prompt } });
		if (!turnId) {
			return false;
		}
		await this.waitFor(id);
		return true;
	}

	resolveApproval(id: string, approved: boolean): void {
		if (!this.approvals.resolve(id, approved)) {
			throw new Error("Este pedido de confirmação já não está aberto.");
		}
	}

	cancel(reason: Interruption = "user"): void {
		this.stopped += 1;
		this.request = null;
		this.interrupt(reason);
	}

	private interrupt(reason: Interruption): void {
		this.record.cancel(reason);
		for (const [peer, request] of this.peers) {
			if (peer.request === request) {
				peer.cancel(reason);
			}
		}
		this.peers.clear();
		this.approvals.denyAll();
		for (const session of this.logins) {
			session.cancel();
		}
		if (this.execution) {
			closeBrowser(this.bot.id);
			this.execution.cancel();
		}
		this.changed();
	}

	async close(): Promise<void> {
		this.closed = true;
		this.cancel("closed");
		closeBrowser(this.bot.id);
		await this.accepting;
		await this.running;
	}

	private assertOpen(): void {
		if (this.closed) {
			throw new Error("Esta conversa foi fechada.");
		}
		if (this.fault) {
			throw this.fault;
		}
	}

	private async submit(delivery: { id: string; entry: Entry; signal?: AbortSignal; afterTurn?: string }): Promise<string | null> {
		const stopped = this.stopped;
		const accepting = this.accepting.then(async () => {
			this.assertOpen();
			delivery.signal?.throwIfAborted();
			const existing = this.record.accepted(delivery.id, delivery.entry);
			if (existing) {
				return existing;
			}
			if (delivery.afterTurn && this.request !== delivery.afterTurn) {
				return null;
			}
			if ((delivery.entry.kind === "routine" || delivery.entry.kind === "answer") && this.busy) {
				return null;
			}
			if (stopped !== this.stopped) {
				throw new Error("O envio foi cancelado antes de começar.");
			}
			if (delivery.entry.kind !== "answer") {
				this.interrupt("message");
			}
			await this.running;
			this.assertOpen();
			delivery.signal?.throwIfAborted();
			if (stopped !== this.stopped) {
				throw new Error("O envio foi cancelado antes de começar.");
			}
			this.record.seal();
			const turnId = this.record.start(delivery.id, delivery.entry);
			if (delivery.entry.kind !== "answer") {
				this.request = turnId;
			}
			this.changed();
			this.running = this.run(turnId).catch((error: unknown) => {
				console.error("Conversation persistence failed", error);
				this.fault = new Error(`Não foi possível salvar a conversa: ${errorText(error)}. Reinicie o mimo antes de continuar.`);
				this.changed();
			}).finally(() => { this.running = null; });
			return turnId;
		});
		this.accepting = accepting.then(() => {}, () => {});
		return await accepting;
	}

	private async run(turnId: string): Promise<void> {
		let failure: string | null = null;
		try {
			const execution = new BotExecution({
				bot: this.bot,
				record: this.record,
				context: {
					chat: this.chat,
					browser: () => browserFor(this.bot.id),
					login: (target) => this.login(target),
					ask: async (ask, signal) => await this.ask(ask, signal),
				},
				speak: (speech) => {
					const receipt = this.record.speak(turnId, speech);
					this.changed();
					return receipt;
				},
				publish: (event) => this.publish(event),
				changed: () => this.changed(),
				approve: async (call, signal) => {
					const asking = approvalInput(call.name, call.input);
					return !asking || await this.origin().approvals.ask({ id: call.id, bot: this.bot.name, toolName: call.name, input: asking.input }, signal);
				},
			});
			this.execution = execution;
			this.changed();
			failure = await execution.run();
		} catch (error) {
			failure = errorText(error);
		} finally {
			try {
				this.record.finish(turnId, failure);
			} finally {
				this.execution = null;
				this.changed();
			}
		}
	}

	private async waitFor(id: string, signal?: AbortSignal): Promise<string> {
		for await (const _batch of this.watch(signal)) {
			const outcome = this.record.answerFor(id);
			if (outcome) {
				if (outcome.failure) {
					throw new Error(outcome.failure);
				}
				return outcome.text;
			}
		}
		throw new Error("O trabalho foi parado.");
	}

	private async ask(ask: Ask, signal?: AbortSignal): Promise<AskResult> {
		const sourceTurn = this.request;
		if (!sourceTurn) {
			throw new Error("Esta pergunta não pertence a um turno ativo.");
		}
		const target = (await listBots()).find((bot) => bot.name.toLowerCase() === ask.bot.trim().toLowerCase());
		if (!target) {
			throw new Error(`Não existe um bot chamado ${ask.bot}. Veja os nomes com list_bots.`);
		}
		const chain = [...this.chain, this.bot.id];
		if (chain.includes(target.id) || chain.length > CHAIN_LIMIT) {
			throw new Error("Esta pergunta voltaria a um bot da corrente ou passaria por bots demais.");
		}
		const peer = await Conversation.open({ botId: target.id, askedBy: this.bot.id });
		peer.host = this;
		peer.chain = chain;
		const id = randomUUID();
		const turnId = await peer.submit({ id, entry: { kind: "ask", peer: this.bot.name, text: ask.prompt }, signal });
		if (!turnId) {
			throw new Error("Esta pergunta foi interrompida antes de começar.");
		}
		this.peers.set(peer, turnId);
		const cancel = () => {
			if (peer.request === turnId) {
				peer.cancel(this.record.active?.interruptedBy ?? "closed");
			}
		};
		signal?.addEventListener("abort", cancel, { once: true });
		if (signal?.aborted) {
			cancel();
		}
		const answer = peer.waitFor(id, signal).finally(() => {
			signal?.removeEventListener("abort", cancel);
		});
		if (ask.wait) {
			return { bot: target.name, reply: await answer };
		}
		void this.relay({ answer, id, name: target.name, sourceTurn, signal }).catch((error: unknown) => {
			if (!this.closed && !signal?.aborted) {
				console.error("Bot reply delivery failed", error);
			}
		});
		return { bot: target.name, status: "perguntei" };
	}

	private async relay(input: { answer: Promise<string>; id: string; name: string; sourceTurn: string; signal?: AbortSignal }): Promise<void> {
		const answer = await input.answer.then((text) => ({ text, failed: false }), (error: unknown) => ({ text: errorText(error), failed: true }));
		while (!this.closed && !input.signal?.aborted && this.request === input.sourceTurn) {
			await this.running;
			const accepted = await this.submit({ id: `answer:${input.id}`, entry: { ...answer, kind: "answer", peer: input.name }, afterTurn: input.sourceTurn, signal: input.signal });
			if (accepted) {
				return;
			}
		}
	}

	private login(target: LoginTarget): LoginSession {
		const session = requestLogin(target);
		this.logins.add(session);
		void session.finished.catch(() => {}).finally(() => this.logins.delete(session));
		this.origin().publish({ type: "login", target, session });
		return session;
	}

	private origin(): Conversation { return this.host?.origin() ?? this; }

	private publish(event: BotEvent): void {
		if (event.type !== "login") {
			this.record.emit(event, this.record.active?.id);
		}
		this.changed();
	}

	private changed(): void {
		for (const wake of this.watchers) {
			wake();
		}
	}
}

function errorText(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
