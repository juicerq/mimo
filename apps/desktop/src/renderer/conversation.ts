import { useEffect, useReducer } from "react";
import type { ConversationBatch } from "@agent/conversation/record";
import type { ChatKey } from "@agent/bot/types";
import type { ScreenEvent } from "../main/router";
import { rpc } from "./rpc";

type EventMap = { [Event in ScreenEvent as Event["type"]]: Event };

export interface ToolResult {
	text: string;
	failed: boolean;
}

export type Line =
	| { kind: "you"; text: string; images: readonly string[] }
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
	cursor: number;
	lines: Line[];
	turn: Turn;
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

function resolveApproval(lines: Line[], event: EventMap["approval-resolved"]): boolean {
	const at = lines.findLastIndex((line) => line.kind === "approval" && line.approval.id === event.id && !line.outcome);
	const line = lines[at];
	if (line?.kind !== "approval") {
		return false;
	}
	lines[at] = { ...line, outcome: event.outcome };
	return true;
}

const EDITS: Edits = {
	user: adds((event) => ({ kind: "you", text: event.text, images: event.images })),
	summary: adds((event) => ({ kind: "summary", text: event.text })),
	warning: adds((event) => ({ kind: "warning", text: event.text })),
	routine: adds((event) => ({ kind: "routine", name: event.name, prompt: event.prompt })),
	reply: adds((event) => (event.text ? { kind: "reply", text: event.text } : null)),
	tool: adds((event) => ({ kind: "tool", id: event.id, name: event.toolName, input: event.input })),
	asked: adds((event) => ({ kind: "asked", peer: event.peer, prompt: event.prompt })),
	answered: adds((event) => ({ kind: "answered", peer: event.peer, text: event.text, failed: event.failed })),
	"tool-result": (lines, event) => settleTool(lines, event, { text: event.output, failed: false }),
	"tool-warned": adds((event) => ({ kind: "warning", text: event.message })),
	"tool-failed": (lines, event) => settleTool(lines, event, { text: event.message, failed: true }),
	approval: adds((event) => ({ kind: "approval", approval: event.approval })),
	"approval-resolved": resolveApproval,
	usage: unchanged,
	"turn-started": unchanged,
	"turn-finished": unchanged,
	"turn-failed": adds((event) => ({ kind: "error", text: event.message })),
	"turn-cancelled": adds((event) => (event.reason === "user" ? { kind: "stopped" } : null)),
};

const TURN_AFTER: Partial<Record<ScreenEvent["type"], Turn>> = {
	"turn-started": "thinking",
	approval: "waiting",
	"approval-resolved": "thinking",
	"turn-finished": "idle",
	"turn-failed": "idle",
	"turn-cancelled": "idle",
};

const EMPTY: Conversation = { ready: false, cursor: 0, lines: [], turn: "idle" };

function edit<Type extends keyof EventMap>(lines: Line[], type: Type, event: EventMap[Type]): boolean {
	const apply: Edit<EventMap[Type]> = EDITS[type];
	return apply(lines, event);
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
		next.turn = turnAfter(next.turn, event);
	}
	if (changed) {
		next.lines = lines;
	}
	return next;
}

function applyBatch(conversation: Conversation, batch: ConversationBatch | ScreenEvent[]): Conversation {
	if (Array.isArray(batch)) {
		return applyEvents(conversation, batch);
	}
	if (!batch.reset && batch.cursor <= conversation.cursor) {
		return conversation;
	}
	return { ...applyEvents(batch.reset ? EMPTY : conversation, batch.events), cursor: batch.cursor };
}

async function reconnect(signal: AbortSignal): Promise<void> {
	await new Promise<void>((resolve) => {
		const done = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", done);
			resolve();
		};
		const timer = setTimeout(done, 1000);
		signal.addEventListener("abort", done, { once: true });
		if (signal.aborted) {
			done();
		}
	});
}

async function follow(chat: ChatKey, signal: AbortSignal, apply: (events: ConversationBatch | ScreenEvent[]) => void): Promise<void> {
	while (!signal.aborted) {
		try {
			const batches = await rpc.conversation.watch(chat, { signal });
			for await (const events of batches) {
				if (!signal.aborted) {
					apply(events);
				}
			}
		} catch (error) {
			if (!signal.aborted) {
				apply([{ type: "warning", text: error instanceof Error ? error.message : String(error) }]);
			}
		}
		await reconnect(signal);
	}
}

export function useConversation(botId: string, askedBy?: string) {
	const [conversation, apply] = useReducer(applyBatch, EMPTY);

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
