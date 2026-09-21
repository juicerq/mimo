import { calculateContextTokens, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message, Usage } from "@earendil-works/pi-ai";
import { markImages, splitImages } from "../images/images";
import { contentText, isLlmMessage } from "../messages";
import { answeredEvent, askedEvent, isAsk } from "../peers/tools";
import { isSpeech, spokenText } from "../speech/tools";
import { toolWarning } from "../tools/tool";
import type { BotEvent } from "./types";

export type Entry =
	| { kind: "user"; text: string; images: readonly string[] }
	| { kind: "ask"; peer: string; text: string }
	| { kind: "answer"; peer: string; text: string; failed: boolean }
	| { kind: "routine"; name: string; text: string }
	| { kind: "summary"; text: string };

export interface LastMessage {
	from: "you" | "bot";
	text: string;
	at: number;
}

type ToolCall = Pick<Extract<BotEvent, { type: "tool-result" }>, "id" | "toolName">;

const PREVIEW_CHARACTERS = 200;
const SUMMARY_MARK = "[resumo]";
const ROUTINE_MARK = /^\[rotina(?:: (?<name>[^\]\n]+))?\]\n/u;
const PEER_MARK = /^\[(?<kind>pergunta|resposta|erro) de (?<peer>[^\]\n]+)\]\n/u;
const PEER_MARKS = { ask: "pergunta", answer: "resposta", failure: "erro" };

export function entryMessage(entry: Entry): AgentMessage {
	return { role: "user", content: entryContent(entry), timestamp: Date.now() };
}

function peerMark(entry: Extract<Entry, { kind: "ask" | "answer" }>): string {
	if (entry.kind === "ask") {
		return PEER_MARKS.ask;
	}
	if (entry.failed) {
		return PEER_MARKS.failure;
	}
	return PEER_MARKS.answer;
}

function entryContent(entry: Entry): string {
	if (entry.kind === "routine") {
		return `[rotina: ${entry.name}]\n${entry.text}`;
	}
	if (entry.kind === "ask" || entry.kind === "answer") {
		return `[${peerMark(entry)} de ${entry.peer}]\n${entry.text}`;
	}
	if (entry.kind === "summary") {
		return `${SUMMARY_MARK}\n${entry.text}`;
	}
	return markImages(entry.images, entry.text);
}

export function entryEvent(entry: Entry): BotEvent {
	if (entry.kind === "routine") {
		return { type: "routine", name: entry.name, prompt: entry.text };
	}
	if (entry.kind === "ask") {
		return { type: "user", text: entry.text, images: [] };
	}
	if (entry.kind === "answer") {
		return { type: "answered", peer: entry.peer, text: entry.text, failed: entry.failed };
	}
	if (entry.kind === "summary") {
		return { type: "summary", text: entry.text };
	}
	return { type: "user", text: entry.text, images: entry.images };
}

function peerEntry(text: string): Entry | null {
	const peer = PEER_MARK.exec(text);
	if (!peer?.groups) {
		return null;
	}
	const body = text.slice(peer[0].length);
	if (peer.groups.kind === PEER_MARKS.ask) {
		return { kind: "ask", peer: peer.groups.peer, text: body };
	}
	return { kind: "answer", peer: peer.groups.peer, text: body, failed: peer.groups.kind === PEER_MARKS.failure };
}

function entryOf(text: string): Entry {
	const routine = ROUTINE_MARK.exec(text);
	if (routine) {
		return { kind: "routine", name: routine.groups?.name ?? "rotina", text: text.slice(routine[0].length) };
	}
	const peer = peerEntry(text);
	if (peer) {
		return peer;
	}
	if (text.startsWith(`${SUMMARY_MARK}\n`)) {
		return { kind: "summary", text: text.slice(SUMMARY_MARK.length + 1) };
	}
	const pasted = splitImages(text);
	return { kind: "user", text: pasted.text, images: pasted.names };
}

export function summaryStart(messages: AgentMessage[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (isLlmMessage(message) && message.role === "user" && entryOf(contentText(message.content)).kind === "summary") {
			return index;
		}
	}
	return 0;
}

function saidText(message: Exclude<Message, { role: "toolResult" }>): string | null {
	if (message.role === "assistant") {
		return message.content.flatMap((part) => (part.type === "toolCall" ? [spokenText(part.name, part.arguments)] : [])).findLast((text) => text !== null) ?? null;
	}
	const entry = entryOf(contentText(message.content));
	if (entry.kind !== "user") {
		return null;
	}
	return entry.text;
}

function spoken(message: AgentMessage): LastMessage | null {
	if (!isLlmMessage(message) || message.role === "toolResult") {
		return null;
	}
	const preview = saidText(message)?.trim().slice(0, PREVIEW_CHARACTERS);
	if (!preview) {
		return null;
	}
	return { from: message.role === "user" ? "you" : "bot", text: preview, at: message.timestamp };
}

export function callEvent(toolName: string, id: string, input: unknown): BotEvent {
	const said = spokenText(toolName, input);
	if (said !== null) {
		return { type: "reply", text: said };
	}
	return askedEvent(toolName, id, input) ?? { type: "tool", id, toolName, input };
}

export function lastMessage(messages: AgentMessage[]): LastMessage | null {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const last = spoken(messages[index]);
		if (last) {
			return last;
		}
	}
	return null;
}

export function resultEvent(tool: ToolCall, output: string, failed: boolean): BotEvent[] {
	if (isSpeech(tool.toolName)) {
		return [];
	}
	if (failed) {
		return [{ type: "tool-failed", ...tool, message: output }];
	}
	if (isAsk(tool.toolName)) {
		const answered = answeredEvent(output);
		if (!answered) {
			return [];
		}
		return [answered];
	}
	const warning = toolWarning(output);

	return [
		...warning ? [{ type: "tool-warned" as const, message: warning }] : [],
		{ type: "tool-result", ...tool, output },
	];
}

function toolErrorText(result: unknown): string {
	if (result && typeof result === "object" && "content" in result && Array.isArray(result.content)) {
		return result.content.filter((part) => part.type === "text").map((part) => part.text).join("");
	}
	return "tool failed";
}

export function toolResultText(result: unknown): string {
	const text = toolErrorText(result);
	if (text !== "tool failed") {
		return text;
	}
	return JSON.stringify(result) ?? "";
}

export function usageEvent(usage: Usage): BotEvent[] {
	const contextTokens = calculateContextTokens(usage);
	if (contextTokens === 0) {
		return [];
	}
	return [{ type: "usage", contextTokens }];
}

export function replayMessage(message: AgentMessage): BotEvent[] {
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
		const tool = { id: message.toolCallId, toolName: message.toolName };
		return resultEvent(tool, contentText(message.content), message.isError);
	}
	return [
		...message.content.filter((part) => part.type === "toolCall").map((part) => callEvent(part.name, part.id, part.arguments)),
		...usageEvent(message.usage),
	];
}
