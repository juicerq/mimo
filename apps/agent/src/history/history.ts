import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { summaryStart } from "../bot/events";
import { readTranscript } from "../bot/store";
import { contentText, isLlmMessage } from "../messages";

const HISTORY_RESPONSE_CHARACTERS = 12_000;
const SNIPPET_CHARACTERS = 600;
const SNIPPET_LEAD = 120;

interface HistoryMessage {
	messageId: number;
	kind: string;
	text: string;
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

async function beforeWindow(botId: string): Promise<HistoryMessage[]> {
	const log = await readTranscript(botId);
	return log.slice(0, summaryStart(log))
		.flatMap(projectMessage)
		.map((message, messageId) => ({ ...message, messageId }));
}

function normalizeSearch(text: string) {
	return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export async function searchHistory(input: { botId: string; query: string; offset: number; limit: number }) {
	const terms = normalizeSearch(input.query).split(/\s+/u).filter(Boolean);
	const matches: { messageId: number; kind: string; snippet: string }[] = [];
	for (const message of await beforeWindow(input.botId)) {
		const text = normalizeSearch(message.text);
		if (terms.length === 0 && message.kind !== "user") {
			continue;
		}
		if (!terms.every((term) => text.includes(term))) {
			continue;
		}
		const start = Math.max(0, (terms.length ? text.indexOf(terms[0]) : 0) - SNIPPET_LEAD);
		matches.push({ messageId: message.messageId, kind: message.kind, snippet: message.text.slice(start, start + SNIPPET_CHARACTERS) });
	}
	const end = Math.min(input.offset + input.limit, matches.length);
	return { matches: matches.slice(input.offset, end), nextOffset: end < matches.length ? end : null, total: matches.length };
}

export async function readHistory(input: { botId: string; messageId: number; offset: number; limit: number }) {
	const history = await beforeWindow(input.botId);
	const messages: HistoryMessage[] = [];
	let remaining = HISTORY_RESPONSE_CHARACTERS;
	for (const message of history.slice(input.messageId, input.messageId + input.limit)) {
		const offset = message.messageId === input.messageId ? input.offset : 0;
		const text = message.text.slice(offset, offset + remaining);
		messages.push({ ...message, text });
		remaining -= text.length;
		if (offset + text.length < message.text.length) {
			return { messages, next: { messageId: message.messageId, offset: offset + text.length }, totalMessages: history.length };
		}
	}
	const nextMessageId = input.messageId + messages.length;
	return { messages, next: nextMessageId < history.length ? { messageId: nextMessageId, offset: 0 } : null, totalMessages: history.length };
}
