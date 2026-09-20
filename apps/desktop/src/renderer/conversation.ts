import { useEffect, useReducer } from "react";
import type { ChatKey } from "@agent/bot/types";
import type { ScreenEvent } from "../main/router";
import { rpc } from "./rpc";

type EventMap = { [Event in ScreenEvent as Event["type"]]: Event };

export interface ToolResult {
	text: string;
	failed: boolean;
}

export type Line =
	| { kind: "you"; text: string }
	| { kind: "reply"; text: string }
	| { kind: "summary"; text: string }
	| { kind: "routine"; name: string; prompt: string }
	| { kind: "asked"; peer: string; prompt: string }
	| { kind: "answered"; peer: string; text: string; failed: boolean }
	| { kind: "tool"; id: string; name: string; input: unknown; result?: ToolResult }
	| { kind: "approval"; approval: EventMap["approval"]["approval"]; outcome?: EventMap["approval-resolved"]["outcome"] }
	| { kind: "warning"; text: string }
	| { kind: "error"; text: string }
	| { kind: "stopped" };

export type Turn = "idle" | "thinking" | "working" | "waiting";

export interface Conversation {
	ready: boolean;
	lines: Line[];
	streaming: string;
	turn: Turn;
	queue: readonly string[];
}

type Edit<Event> = (lines: Line[], event: Event) => boolean;

type Edits = { [Type in keyof EventMap]: Edit<EventMap[Type]> };

function adds<Event>(make: (event: Event) => Line | null): Edit<Event> {
	return (lines, event) => {
		const line = make(event);
		if (!line) {
			return false;
		}
		lines.push(line);
		return true;
	};
}

function unchanged(): boolean {
	return false;
}

function settleTool(lines: Line[], call: Pick<EventMap["tool-result"], "id" | "toolName">, result: ToolResult): boolean {
	const at = lines.findLastIndex((line) => line.kind === "tool" && line.id === call.id);
	const line = lines[at];
	if (line?.kind !== "tool") {
		lines.push({ kind: "tool", id: call.id, name: call.toolName, input: undefined, result });
		return true;
	}
	lines[at] = { ...line, result };
	return true;
}

function resolveApproval(lines: Line[], outcome: EventMap["approval-resolved"]["outcome"]): boolean {
	const at = lines.findLastIndex((line) => line.kind === "approval" && !line.outcome);
	const line = lines[at];
	if (line?.kind !== "approval") {
		return false;
	}
	lines[at] = { ...line, outcome };
	return true;
}

const EDITS: Edits = {
	user: adds((event) => ({ kind: "you", text: event.text })),
	queue: unchanged,
	summary: adds((event) => ({ kind: "summary", text: event.text })),
	warning: adds((event) => ({ kind: "warning", text: event.text })),
	routine: adds((event) => ({ kind: "routine", name: event.name, prompt: event.prompt })),
	"reply-delta": unchanged,
	reply: adds((event) => (event.text ? { kind: "reply", text: event.text } : null)),
	tool: adds((event) => ({ kind: "tool", id: event.id, name: event.toolName, input: event.input })),
	asked: adds((event) => ({ kind: "asked", peer: event.peer, prompt: event.prompt })),
	answered: adds((event) => ({ kind: "answered", peer: event.peer, text: event.text, failed: event.failed })),
	"tool-result": (lines, event) => settleTool(lines, event, { text: event.output, failed: false }),
	"tool-warned": adds((event) => ({ kind: "warning", text: event.message })),
	"tool-failed": (lines, event) => settleTool(lines, event, { text: event.message, failed: true }),
	approval: adds((event) => ({ kind: "approval", approval: event.approval })),
	"approval-resolved": (lines, event) => resolveApproval(lines, event.outcome),
	usage: unchanged,
	"turn-started": unchanged,
	"turn-finished": unchanged,
	"turn-failed": adds((event) => ({ kind: "error", text: event.message })),
	"turn-cancelled": adds(() => ({ kind: "stopped" })),
};

const TURN_AFTER: Partial<Record<ScreenEvent["type"], Turn>> = {
	"turn-started": "thinking",
	approval: "waiting",
	"approval-resolved": "thinking",
	"turn-finished": "idle",
	"turn-failed": "idle",
	"turn-cancelled": "idle",
};

const EMPTY: Conversation = { ready: false, lines: [], streaming: "", turn: "idle", queue: [] };

function edit<Type extends keyof EventMap>(lines: Line[], type: Type, event: EventMap[Type]): boolean {
	const apply: Edit<EventMap[Type]> = EDITS[type];
	return apply(lines, event);
}

function streamingAfter(streaming: string, event: ScreenEvent): string {
	if (event.type === "reply-delta") {
		return streaming + event.delta;
	}
	if (event.type === "reply") {
		return "";
	}
	return streaming;
}

function turnAfter(turn: Turn, event: ScreenEvent): Turn {
	if (event.type === "tool" && turn === "thinking") {
		return "working";
	}
	return TURN_AFTER[event.type] ?? turn;
}

function applyEvents(conversation: Conversation, events: ScreenEvent[]): Conversation {
	const lines = [...conversation.lines];
	let changed = false;
	const next = { ...conversation, ready: true };
	for (const event of events) {
		changed = edit(lines, event.type, event) || changed;
		next.streaming = streamingAfter(next.streaming, event);
		next.turn = turnAfter(next.turn, event);
		if (event.type === "queue") {
			next.queue = event.items;
		}
	}
	if (changed) {
		next.lines = lines;
	}
	return next;
}

async function follow(chat: ChatKey, signal: AbortSignal, apply: (events: ScreenEvent[]) => void): Promise<void> {
	const batches = await rpc.conversation.watch(chat, { signal });
	for await (const events of batches) {
		apply(events);
	}
}

export function useConversation(botId: string, askedBy?: string) {
	const [conversation, apply] = useReducer(applyEvents, EMPTY);

	useEffect(() => {
		const controller = new AbortController();
		void follow({ botId, ...askedBy && { askedBy } }, controller.signal, apply).catch((error: unknown) => {
			if (!controller.signal.aborted) {
				apply([{ type: "warning", text: error instanceof Error ? error.message : String(error) }]);
			}
		});
		return () => controller.abort();
	}, [botId, askedBy]);

	return [conversation, apply] as const;
}
