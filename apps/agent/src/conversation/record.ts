import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { entryEvent, entryMessage, resultEvent, summaryStart, type Entry } from "../bot/events";
import { orderTranscript, unansweredCalls } from "../bot/seal";
import { contentText } from "../messages";
import type { BotEvent, ChatKey, Interruption } from "../bot/types";
import { database, type Store } from "../storage/database";
import { compactions, conversations, deliveries, messages, records, speeches, turns } from "../storage/schema";

export type RecordedEvent = Exclude<BotEvent, { type: "login" }>;
export interface LastMessage { from: "you" | "bot"; text: string; at: number }
export interface ConversationBatch { reset: boolean; cursor: number; events: RecordedEvent[] }
export interface Speech { id: string; callId: string; text: string; done: boolean }

export function conversationId(chat: ChatKey): string {
	if (chat.askedBy) {
		return `${chat.botId}:${chat.askedBy}`;
	}
	return chat.botId;
}

export function appendRecord(db: Store, record: { conversationId: string; event: RecordedEvent; id?: string; turnId?: string; at?: number }): void {
	db.insert(records).values({ ...record, kind: record.event.type, id: record.id ?? randomUUID(), at: record.at ?? Date.now() }).onConflictDoNothing().run();
}

export function appendMessage(db: Store, conversationId: string, message: AgentMessage, id?: string): void {
	const identity = id ?? randomUUID();
	db.insert(messages).values({ conversationId, id: identity, message }).onConflictDoNothing().run();
}

export class ConversationRecord {
	readonly id: string;

	constructor(chat: ChatKey) {
		this.id = conversationId(chat);
		database().insert(conversations).values({ id: this.id, botId: chat.botId, askedBy: chat.askedBy }).onConflictDoNothing().run();
	}

	get active() {
		return database().select().from(turns).where(and(eq(turns.conversationId, this.id), inArray(turns.status, ["running", "stopping"]))).get();
	}

	get latest() {
		return database().select().from(turns).where(eq(turns.conversationId, this.id)).orderBy(desc(turns.seq)).get();
	}

	get log(): AgentMessage[] {
		return orderTranscript(database().select().from(messages).where(eq(messages.conversationId, this.id)).orderBy(asc(messages.seq)).all());
	}

	get window(): AgentMessage[] {
		const cut = database().select().from(compactions).where(eq(compactions.conversationId, this.id)).orderBy(desc(compactions.seq)).get();
		if (!cut) {
			const log = this.log;
			return log.slice(summaryStart(log));
		}
		return [cut.summary, ...orderTranscript(database().select().from(messages).where(and(eq(messages.conversationId, this.id), gt(messages.seq, cut.start - 1))).orderBy(asc(messages.seq)).all())];
	}

	get archive(): AgentMessage[] {
		const cut = database().select().from(compactions).where(eq(compactions.conversationId, this.id)).orderBy(desc(compactions.seq)).get();
		const log = this.log;
		if (!cut) {
			return log.slice(0, summaryStart(log));
		}
		return orderTranscript(database().select().from(messages).where(and(eq(messages.conversationId, this.id), lt(messages.seq, cut.start))).orderBy(asc(messages.seq)).all());
	}

	compact(summary: string, retained: AgentMessage[]): void {
		const first = retained[0];
		const row = database().select().from(messages).where(eq(messages.conversationId, this.id)).all().find((item) => JSON.stringify(item.message) === JSON.stringify(first));
		if (!row) {
			throw new Error("O início da Janela não existe no Registro.");
		}
		database().transaction((db) => {
			db.insert(compactions).values({ conversationId: this.id, start: row.seq, summary: entryMessage({ kind: "summary", text: summary }) }).run();
			appendRecord(db, { conversationId: this.id, event: { type: "summary", text: summary } });
		});
	}

	get lastMessage(): LastMessage | null {
		const row = database().select().from(records).where(and(eq(records.conversationId, this.id), inArray(records.kind, ["reply", "user"]))).orderBy(desc(records.seq)).limit(1).get();
		if (!row || (row.event.type !== "reply" && row.event.type !== "user")) {
			return null;
		}
		return { from: row.event.type === "user" ? "you" : "bot", text: row.event.text.slice(0, 200), at: row.at };
	}

	since(cursor: number) {
		return database().select().from(records).where(and(eq(records.conversationId, this.id), gt(records.seq, cursor))).orderBy(asc(records.seq)).all();
	}

	snapshot(): ConversationBatch {
		return database().transaction(() => {
			const rows = this.since(0);
			return { reset: true, cursor: rows.at(-1)?.seq ?? 0, events: rows.map((row) => row.event) };
		});
	}

	emit(event: RecordedEvent, turnId?: string): void {
		appendRecord(database(), { conversationId: this.id, event, ...turnId && { turnId } });
	}

	accepted(id: string, entry: Entry): string | null {
		const existing = database().select().from(deliveries).where(and(eq(deliveries.conversationId, this.id), eq(deliveries.id, id))).get();
		if (!existing) {
			return null;
		}
		if (JSON.stringify(existing.entry) !== JSON.stringify(entry)) {
			throw new Error("Esta entrega já existe com outro conteúdo.");
		}
		return existing.turnId;
	}

	start(id: string, entry: Entry): string {
		return database().transaction((db) => {
			if (this.active) {
				throw new Error("O turno anterior ainda não terminou de parar.");
			}
			const turnId = randomUUID();
			const message = entryMessage(entry);
			db.insert(turns).values({ id: turnId, conversationId: this.id, status: "running", startedAt: message.timestamp }).run();
			db.insert(deliveries).values({ conversationId: this.id, id, entry, turnId }).run();
			appendRecord(db, { conversationId: this.id, turnId, event: { type: "turn-started" } });
			appendRecord(db, { conversationId: this.id, turnId, id: `entry:${id}`, event: entryEvent(entry), at: message.timestamp });
			appendMessage(db, this.id, message, `entry:${id}`);
			return turnId;
		});
	}

	speak(turnId: string, speech: Speech): { sent: true } {
		return database().transaction((db) => {
			const existing = db.select().from(speeches).where(and(eq(speeches.conversationId, this.id), eq(speeches.callId, speech.id))).get();
			if (existing) {
				if (existing.turnId !== turnId || existing.text !== speech.text || existing.done !== speech.done) {
					throw new Error("Esta fala já foi enviada com outro conteúdo.");
				}
				return { sent: true };
			}
			if (this.active?.id !== turnId || this.active.status !== "running") {
				throw new Error("Este turno já foi interrompido.");
			}
			const at = Date.now();
			db.insert(speeches).values({ conversationId: this.id, turnId, callId: speech.id, text: speech.text, done: speech.done }).run();
			appendRecord(db, { conversationId: this.id, turnId, id: `speech:${turnId}:${speech.id}`, at, event: { type: "reply", text: speech.text } });
			appendMessage(db, this.id, { role: "toolResult", toolCallId: speech.callId, toolName: "send_message", content: [{ type: "text", text: JSON.stringify({ sent: true }) }], isError: false, timestamp: at }, `result:${speech.id}`);
			if (speech.done) {
				db.update(turns).set({ finalSpeech: speech.id }).where(eq(turns.id, turnId)).run();
			}
			return { sent: true };
		});
	}

	result(message: Extract<AgentMessage, { role: "toolResult" }>, id: string): void {
		database().transaction((db) => {
			appendMessage(db, this.id, message, id);
			const events = resultEvent({ id: id.slice("result:".length), toolName: message.toolName }, contentText(message.content), message.isError);
			for (const [index, event] of events.entries()) {
				appendRecord(db, { conversationId: this.id, id: `${id}:${index}`, event, ...this.active && { turnId: this.active.id } });
			}
		});
	}

	message(message: AgentMessage): string {
		const id = randomUUID();
		appendMessage(database(), this.id, message, id);
		return id;
	}

	seal(): void {
		const rows = database().select().from(messages).where(eq(messages.conversationId, this.id)).orderBy(asc(messages.seq)).all();
		for (const row of unansweredCalls(rows)) {
			if (row.message.role === "toolResult") {
				this.result(row.message, row.id);
			}
		}
	}

	cancel(reason: Interruption): void {
		database().transaction((db) => {
			const turn = this.active;
			if (turn) {
				db.update(turns).set({ status: "stopping", interruptedBy: turn.interruptedBy === "user" ? "user" : reason }).where(eq(turns.id, turn.id)).run();
			}
		});
	}

	finish(turnId: string, failure: string | null): void {
		database().transaction((db) => {
			const turn = this.active;
			if (!turn || turn.id !== turnId) {
				return;
			}
			const { status, event } = completion(turn.status, failure, turn.interruptedBy);
			db.update(turns).set({ status, failure: status === "failed" ? failure : null }).where(eq(turns.id, turnId)).run();
			appendRecord(db, { conversationId: this.id, turnId, event });
		});
	}

	recover(): void {
		database().transaction((db) => {
			const turn = this.active;
			if (turn) {
				db.update(turns).set({ status: "interrupted", interruptedBy: turn.interruptedBy ?? "closed" }).where(eq(turns.id, turn.id)).run();
			}
			const pending = new Map<string, string>();
			for (const { event } of this.since(0)) {
				if (event.type === "approval") {
					pending.set(event.approval.id, event.approval.toolName);
				}
				if (event.type === "approval-resolved") {
					pending.delete(event.id);
				}
			}
			for (const id of pending.keys()) {
				appendRecord(db, { conversationId: this.id, event: { type: "approval-resolved", id, outcome: "denied" } });
			}
			if (turn) {
				appendRecord(db, { conversationId: this.id, turnId: turn.id, event: { type: "turn-cancelled", reason: turn.interruptedBy ?? "closed" } });
			}
		});
	}

	answerFor(id: string): { failure: string | null; text: string } | null {
		const delivery = database().select({ turn: turns }).from(deliveries).innerJoin(turns, eq(deliveries.turnId, turns.id)).where(and(eq(deliveries.conversationId, this.id), eq(deliveries.id, id))).get();
		if (!delivery || delivery.turn.status === "running" || delivery.turn.status === "stopping") {
			return null;
		}
		const { turn } = delivery;
		const speech = database().select().from(records).where(and(eq(records.turnId, turn.id), eq(records.kind, "reply"))).orderBy(desc(records.seq)).limit(1).get();
		return { failure: turn.failure ?? (turn.status === "interrupted" ? "O trabalho foi parado." : null), text: speech?.event.type === "reply" ? speech.event.text : "" };
	}

}

function completion(status: string, failure: string | null, reason: Interruption | null): { status: "interrupted" | "failed" | "finished"; event: RecordedEvent } {
	if (status === "stopping") {
		if (!reason) {
			throw new Error("A interrupção do turno não tem motivo gravado.");
		}
		return { status: "interrupted", event: { type: "turn-cancelled", reason } };
	}
	if (failure) {
		return { status: "failed", event: { type: "turn-failed", message: failure } };
	}
	return { status: "finished", event: { type: "turn-finished" } };
}
