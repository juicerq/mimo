import type { Session } from "eve/channels";
import type { MessageStreamEvent } from "eve/client";
import { readdir } from "node:fs/promises";
import { z } from "zod";
import { dataPath } from "./data";
import { readJsonFile, writeTextFile } from "./files";

const ArchiveSchema = z.object({
	events: z.array(z.object({
		type: z.string(),
		data: z.object({
			message: z.string().nullable().optional(),
			messageDelta: z.string().optional(),
			turnId: z.string().optional(),
			stepIndex: z.number().optional(),
			actions: z.array(z.json()).optional(),
			result: z.json().optional(),
			status: z.string().optional(),
			error: z.json().optional(),
			requests: z.array(z.json()).optional(),
			resolutions: z.array(z.json()).optional(),
		}).default({}),
	})),
});

interface HistoryMessage {
	messageId: number;
	turnId?: string;
	kind: string;
	text: string;
}

const HISTORY_RESPONSE_CHARACTERS = 12_000;

function projectHistory({ events }: z.infer<typeof ArchiveSchema>) {
	const messages: HistoryMessage[] = [];
	const partial = new Map<string, HistoryMessage>();
	for (const [index, event] of events.entries()) {
		const { data, type } = event;
		const base = { messageId: index, ...(data.turnId ? { turnId: data.turnId } : {}) };
		const key = `${data.turnId}/${data.stepIndex}`;
		if (type === "message.appended") {
			const message = partial.get(key) ?? { ...base, kind: "assistant_partial", text: "" };
			message.text += data.messageDelta ?? "";
			partial.set(key, message);
			continue;
		}
		if (type === "message.completed") {
			if (data.message !== null && data.message !== undefined) {
				partial.delete(key);
				messages.push({ ...base, kind: "assistant", text: data.message });
			}
			continue;
		}
		if (type === "message.received") {
			messages.push({ ...base, kind: "user", text: data.message ?? "" });
			continue;
		}
		const text = historyEventText(event);
		if (text !== null) {
			messages.push({ ...base, kind: type, text });
		}
	}
	return [...messages, ...partial.values()].sort((left, right) => left.messageId - right.messageId)
		.map((message, messageId) => ({ ...message, messageId }));
}

function historyEventText({ type, data }: z.infer<typeof ArchiveSchema>["events"][number]) {
	switch (type) {
		case "actions.requested":
			return JSON.stringify({ status: "requested", actions: data.actions });
		case "action.result":
			return JSON.stringify({ status: data.status, result: data.result, error: data.error });
		case "input.requested":
			return JSON.stringify({ status: "awaiting_input", requests: data.requests });
		case "input.resolved":
			return JSON.stringify({ resolutions: data.resolutions });
		case "step.failed":
		case "session.failed":
			return data.message ?? null;
		case "turn.cancelled":
			return "The turn was cancelled. Requested actions without a result are not confirmed executions.";
		default:
			return null;
	}
}

function sessionPath(botId: string, sessionId: string) {
	return dataPath("bots", botId, "sessions", `${encodeURIComponent(sessionId)}.json`);
}

export async function listSessionArchives(botId: string) {
	const entries = await readdir(dataPath("bots", botId, "sessions")).catch((error: unknown) => {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	});
	return entries.filter((entry) => entry.endsWith(".json")).sort().reverse().map((entry) => decodeURIComponent(entry.slice(0, -5)));
}

async function readArchive(botId: string, sessionId: string) {
	const archive = await readJsonFile(sessionPath(botId, sessionId), ArchiveSchema);
	if (!archive) {
		throw new Error("This session is not archived for this bot. Use search_history to find its sessions.");
	}
	return projectHistory(archive);
}

function normalizeSearch(text: string) {
	return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export async function searchHistory(input: { botId: string; query: string; offset: number; limit: number }) {
	const terms = normalizeSearch(input.query).split(/\s+/u).filter(Boolean);
	const matches: { sessionId: string; messageId: number; kind: string; snippet: string }[] = [];
	for (const sessionId of await listSessionArchives(input.botId)) {
		const messages = await readArchive(input.botId, sessionId);
		for (const message of messages) {
			const text = normalizeSearch(message.text);
			if (terms.length === 0 && message.kind !== "user") {
				continue;
			}
			if (!terms.every((term) => text.includes(term))) {
				continue;
			}
			const start = Math.max(0, (terms.length ? text.indexOf(terms[0]) : 0) - 120);
			matches.push({ sessionId, messageId: message.messageId, kind: message.kind, snippet: message.text.slice(start, start + 600) });
			if (terms.length === 0) {
				break;
			}
		}
	}
	const end = Math.min(input.offset + input.limit, matches.length);
	return { matches: matches.slice(input.offset, end), nextOffset: end < matches.length ? end : null, total: matches.length };
}

export async function readHistory(input: { botId: string; sessionId: string; messageId: number; offset: number; limit: number }) {
	const history = await readArchive(input.botId, input.sessionId);
	const messages: HistoryMessage[] = [];
	let remaining = HISTORY_RESPONSE_CHARACTERS;
	for (const message of history.slice(input.messageId, input.messageId + input.limit)) {
		const offset = message.messageId === input.messageId ? input.offset : 0;
		const text = message.text.slice(offset, offset + remaining);
		messages.push({ ...message, text });
		remaining -= text.length;
		if (offset + text.length < message.text.length) {
			return { sessionId: input.sessionId, messages, next: { messageId: message.messageId, offset: offset + text.length }, totalMessages: history.length };
		}
	}
	const nextMessageId = input.messageId + messages.length;
	return { sessionId: input.sessionId, messages, next: nextMessageId < history.length ? { messageId: nextMessageId, offset: 0 } : null, totalMessages: history.length };
}

export async function readSessionEvents(session: Session) {
	const tail = await session.getStreamTailIndex();
	const events: MessageStreamEvent[] = [];
	const reader = (await session.getEventStream({ startIndex: 0 })).getReader();
	try {
		while (events.length <= tail) {
			const next = await reader.read();
			if (next.done) {
				throw new Error("The session stream ended before its durable tail.");
			}
			events.push(next.value);
		}
	} finally {
		await reader.cancel();
	}
	return events;
}

export async function writeSessionArchive(input: { botId: string; sessionId: string; data: unknown }) {
	const path = sessionPath(input.botId, input.sessionId);
	await writeTextFile(path, `${JSON.stringify(input.data, null, "\t")}\n`, 0o600);
	return path;
}
