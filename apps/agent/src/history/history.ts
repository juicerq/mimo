import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { readdir } from "node:fs/promises";
import { z } from "zod";
import { MessageSchema } from "../bot/types";
import { contentText, isLlmMessage } from "../messages";
import { dataPath } from "../storage/data";
import { readJsonFile, writeTextFile } from "../storage/files";

const ArchiveSchema = z.object({ messages: z.array(MessageSchema) });
const HISTORY_RESPONSE_CHARACTERS = 12_000;
const SNIPPET_CHARACTERS = 600;
const SNIPPET_LEAD = 120;

interface HistoryMessage {
	messageId: number;
	kind: string;
	text: string;
}

function sessionPath(botId: string, sessionId: string) {
	return dataPath("bots", botId, "sessions", `${encodeURIComponent(sessionId)}.json`);
}

export async function archiveSession(input: { botId: string; sessionId: string; messages: AgentMessage[] }): Promise<string> {
	const path = sessionPath(input.botId, input.sessionId);
	const archive = { sessionId: input.sessionId, archivedAt: new Date().toISOString(), messages: input.messages };
	await writeTextFile(path, `${JSON.stringify(archive, null, "\t")}\n`, 0o600);
	return path;
}

async function listSessionArchives(botId: string): Promise<string[]> {
	const entries = await readdir(dataPath("bots", botId, "sessions")).catch((error: unknown) => {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	});
	return entries.filter((entry) => entry.endsWith(".json")).sort().reverse()
		.map((entry) => decodeURIComponent(entry.slice(0, -5)));
}

function projectMessage(message: AgentMessage): { kind: string; text: string }[] {
	if (!isLlmMessage(message)) {
		return [];
	}
	if (message.role === "user") {
		return [{ kind: "user", text: contentText(message.content) }];
	}
	if (message.role === "toolResult") {
		return [{ kind: "tool_result", text: JSON.stringify({ toolName: message.toolName, isError: message.isError, output: contentText(message.content) }) }];
	}
	const text = contentText(message.content);
	const calls = message.content
		.filter((part) => part.type === "toolCall")
		.map((part) => ({ kind: "tool_call", text: JSON.stringify({ toolName: part.name, input: part.arguments }) }));
	return [...(text ? [{ kind: "assistant", text }] : []), ...calls];
}

async function readArchive(botId: string, sessionId: string): Promise<HistoryMessage[]> {
	const archive = await readJsonFile(sessionPath(botId, sessionId), ArchiveSchema);
	if (!archive) {
		throw new Error("This session is not archived for this bot. Use search_history to find its sessions.");
	}
	return archive.messages
		.flatMap(projectMessage)
		.map((message, messageId) => ({ ...message, messageId }));
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
			const start = Math.max(0, (terms.length ? text.indexOf(terms[0]) : 0) - SNIPPET_LEAD);
			matches.push({ sessionId, messageId: message.messageId, kind: message.kind, snippet: message.text.slice(start, start + SNIPPET_CHARACTERS) });
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
