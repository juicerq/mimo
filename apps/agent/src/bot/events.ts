import { calculateContextTokens, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { Usage } from "@earendil-works/pi-ai";
import { contentText, isLlmMessage } from "../messages";
import { isTeamCall, teamCall } from "../team/tools";
import { toolWarning } from "../tools/tool";
import type { BotEvent } from "./types";

export type Entry =
	| { kind: "user"; text: string }
	| { kind: "note"; text: string; short: string }
	| { kind: "routine"; name: string; text: string }
	| { kind: "summary"; text: string };

export interface LastMessage {
	from: "you" | "bot";
	text: string;
	at: number;
}

type ToolCall = Pick<Extract<BotEvent, { type: "tool-result" }>, "id" | "toolName">;

const NOTE_MARK = "[equipe]";
const PREVIEW_CHARACTERS = 200;
const SUMMARY_MARK = "[resumo]";
const ROUTINE_MARK = /^\[rotina(?:: (?<name>[^\]\n]+))?\]\n/u;

export function entryMessage(entry: Entry): AgentMessage {
	return { role: "user", content: entryContent(entry), timestamp: Date.now() };
}

function entryContent(entry: Entry): string {
	if (entry.kind === "routine") {
		return `[rotina: ${entry.name}]\n${entry.text}`;
	}
	if (entry.kind === "note") {
		return `${NOTE_MARK} ${entry.short}\n${entry.text}`;
	}
	if (entry.kind === "summary") {
		return `${SUMMARY_MARK}\n${entry.text}`;
	}
	return entry.text;
}

export function entryEvent(entry: Entry): BotEvent {
	if (entry.kind === "routine") {
		return { type: "routine", name: entry.name, prompt: entry.text };
	}
	if (entry.kind === "note") {
		return { type: "note", text: entry.short };
	}
	if (entry.kind === "summary") {
		return { type: "summary", text: entry.text };
	}
	return { type: "user", text: entry.text };
}

function entryOf(text: string): Entry {
	const routine = ROUTINE_MARK.exec(text);
	if (routine) {
		return { kind: "routine", name: routine.groups?.name ?? "rotina", text: text.slice(routine[0].length) };
	}
	if (text.startsWith(`${NOTE_MARK} `)) {
		const line = text.indexOf("\n");
		const short = line < 0 ? text.slice(NOTE_MARK.length + 1) : text.slice(NOTE_MARK.length + 1, line);
		return { kind: "note", text: text.slice(line < 0 ? text.length : line + 1), short };
	}
	if (text.startsWith(`${NOTE_MARK}\n`)) {
		return { kind: "note", text: text.slice(NOTE_MARK.length + 1), short: text.slice(NOTE_MARK.length + 1) };
	}
	if (text.startsWith(`${SUMMARY_MARK}\n`)) {
		return { kind: "summary", text: text.slice(SUMMARY_MARK.length + 1) };
	}
	return { kind: "user", text };
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

function spoken(message: AgentMessage): LastMessage | null {
	if (!isLlmMessage(message) || message.role === "toolResult") {
		return null;
	}
	const text = contentText(message.content);
	if (message.role === "user" && entryOf(text).kind !== "user") {
		return null;
	}
	const preview = text.trim().slice(0, PREVIEW_CHARACTERS);
	if (!preview) {
		return null;
	}
	return { from: message.role === "user" ? "you" : "bot", text: preview, at: message.timestamp };
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

export function resultEvent(tool: ToolCall, output: string): BotEvent[] {
	const call = teamCall(tool.toolName, output);
	if (call) {
		return [{ type: "team-call", call }];
	}
	const warning = toolWarning(output);

	return [
		...warning ? [{ type: "tool-warned" as const, message: warning }] : [],
		{ type: "tool-result", ...tool, output },
	];
}

export function toolErrorText(result: unknown): string {
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
		if (message.isError) {
			return [{ type: "tool-failed", ...tool, message: toolErrorText(message) }];
		}
		return resultEvent(tool, contentText(message.content));
	}
	const text = contentText(message.content);
	return [
		...(text ? [{ type: "reply" as const, text }] : []),
		...message.content.filter((part) => part.type === "toolCall")
			.filter((part) => !isTeamCall(part.name))
			.map((part) => ({ type: "tool" as const, id: part.id, toolName: part.name, input: part.arguments })),
		...usageEvent(message.usage),
	];
}
