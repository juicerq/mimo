import { useEffect, useReducer } from "react";
import type { ScreenEvent } from "../main/router";
import { rpc } from "./rpc";

type Tone = "quiet" | "alert";

export type Line =
	| { kind: "you"; text: string }
	| { kind: "reply"; text: string }
	| { kind: "note"; tone: Tone; text: string }
	| { kind: "detail"; tone: Tone; text: string; extra?: string }
	| { kind: "result"; text: string };

export type Turn = "idle" | "thinking" | "working" | "waiting";

export interface Conversation {
	lines: Line[];
	streaming: string;
	turn: Turn;
	queue: readonly string[];
}

type EventMap = { [Event in ScreenEvent as Event["type"]]: Event };

type LineMakers = { [Type in keyof EventMap]: (event: EventMap[Type]) => Line | null };

const TEAM_VERBS = { created: "created", delegated: "delegated to", stopped: "stopped", deleted: "deleted" } as const;

function note(text: string, tone: Tone = "quiet"): Line {
	return { kind: "note", tone, text };
}

function trimmed(text?: string): string | undefined {
	const content = text?.trim();
	if (!content || content === "{}") {
		return undefined;
	}
	return content;
}

function detail(text: string, extra?: string): Line {
	const content = trimmed(extra);
	if (!content) {
		return { kind: "detail", tone: "quiet", text };
	}
	return { kind: "detail", tone: "quiet", text, extra: content };
}

function result(output: string): Line | null {
	const text = trimmed(output);
	if (!text) {
		return null;
	}
	return { kind: "result", text };
}

function reply(text: string): Line | null {
	if (!text) {
		return null;
	}
	return { kind: "reply", text };
}

const LINES: LineMakers = {
	user: (event) => ({ kind: "you", text: event.text }),
	queue: () => null,
	note: (event) => note(`▌ ${event.text}`),
	summary: (event) => detail("─ resumo do que veio antes ─", event.text),
	warning: (event) => note(`⚠ ${event.text}`, "alert"),
	routine: (event) => detail(`routine: ${event.name} started`, event.prompt.replaceAll("\n", " ")),
	"reply-delta": () => null,
	reply: (event) => reply(event.text),
	tool: (event) => detail(`⚙ ${event.toolName}`, JSON.stringify(event.input)),
	"team-call": (event) => detail(`▌ ${TEAM_VERBS[event.call.kind]} ${event.call.bot}${event.call.task ? ` · ${event.call.task}` : ""}`),
	"tool-result": (event) => result(event.output),
	"tool-warned": (event) => note(`⚠ ${event.message}`, "alert"),
	"tool-failed": (event) => ({ kind: "detail", tone: "alert", text: `✗ tool failed: ${event.message}` }),
	approval: (event) => note(`⏸ approval: ${event.approval.toolName} · ${event.approval.bot} — 1 aprova, 2 cancela`, "alert"),
	"approval-resolved": (event) => note(`⏸ ${event.outcome}`),
	usage: () => null,
	mode: () => null,
	tools: (event) => detail(`tools: ${event.tools.join(", ") || "none"}`),
	"turn-started": () => null,
	"turn-finished": () => null,
	"turn-failed": (event) => note(`✗ error: ${event.message}`, "alert"),
	"turn-cancelled": () => note("Interrupted."),
};

const TURN_AFTER: Partial<Record<ScreenEvent["type"], Turn>> = {
	"turn-started": "thinking",
	approval: "waiting",
	"approval-resolved": "thinking",
	"turn-finished": "idle",
	"turn-failed": "idle",
	"turn-cancelled": "idle",
};

const EMPTY: Conversation = { lines: [], streaming: "", turn: "idle", queue: [] };

function lineOf<Type extends keyof EventMap>(type: Type, event: EventMap[Type]): Line | null {
	const make: (event: EventMap[Type]) => Line | null = LINES[type];
	return make(event);
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
	const added = events.flatMap((event) => lineOf(event.type, event) ?? []);
	const next = { ...conversation, lines: added.length === 0 ? conversation.lines : [...conversation.lines, ...added] };
	for (const event of events) {
		next.streaming = streamingAfter(next.streaming, event);
		next.turn = turnAfter(next.turn, event);
		if (event.type === "queue") {
			next.queue = event.items;
		}
	}
	return next;
}

async function follow(botId: string, signal: AbortSignal, apply: (events: ScreenEvent[]) => void): Promise<void> {
	const batches = await rpc.conversation.watch({ botId }, { signal });
	for await (const events of batches) {
		apply(events);
	}
}

export function useConversation(botId: string) {
	const [conversation, apply] = useReducer(applyEvents, EMPTY);

	useEffect(() => {
		const controller = new AbortController();
		void follow(botId, controller.signal, apply).catch((error: unknown) => {
			if (!controller.signal.aborted) {
				apply([{ type: "warning", text: error instanceof Error ? error.message : String(error) }]);
			}
		});
		return () => controller.abort();
	}, [botId]);

	return [conversation, apply] as const;
}
