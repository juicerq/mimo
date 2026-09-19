import { useEffect, useReducer } from "react";
import type { ScreenEvent } from "../main/router";
import { rpc } from "./rpc";

type Tone = "you" | "reply" | "detail" | "alert";

interface Line {
	tone: Tone;
	text: string;
}

type Turn = "idle" | "thinking" | "working" | "waiting";

interface Conversation {
	lines: Line[];
	streaming: string;
	turn: Turn;
	queue: readonly string[];
}

type EventMap = { [Event in ScreenEvent as Event["type"]]: Event };

type LineMakers = { [Type in keyof EventMap]: (event: EventMap[Type]) => Line | null };

const TEAM_VERBS = { created: "created", delegated: "delegated to", stopped: "stopped", deleted: "deleted" } as const;

function detail(text: string): Line {
	return { tone: "detail", text };
}

function alert(text: string): Line {
	return { tone: "alert", text };
}

function reply(text: string): Line | null {
	if (!text) {
		return null;
	}
	return { tone: "reply", text };
}

const LINES: LineMakers = {
	user: (event) => ({ tone: "you", text: event.text }),
	queue: () => null,
	note: (event) => detail(`▌ ${event.text}`),
	summary: () => detail("─ resumo do que veio antes ─"),
	warning: (event) => alert(`⚠ ${event.text}`),
	routine: (event) => detail(`routine: ${event.name} started`),
	"reply-delta": () => null,
	reply: (event) => reply(event.text),
	tool: (event) => detail(`⚙ ${event.toolName}`),
	"team-call": (event) => detail(`▌ ${TEAM_VERBS[event.call.kind]} ${event.call.bot}`),
	"tool-result": () => null,
	"tool-warned": (event) => alert(`⚠ ${event.message}`),
	"tool-failed": (event) => alert(`✗ tool failed: ${event.message}`),
	approval: (event) => alert(`⏸ approval: ${event.approval.toolName} · ${event.approval.bot} — 1 aprova, 2 cancela`),
	"approval-resolved": (event) => detail(`⏸ ${event.outcome}`),
	usage: () => null,
	mode: () => null,
	tools: (event) => detail(`tools: ${event.tools.join(", ") || "none"}`),
	"turn-started": () => null,
	"turn-finished": () => null,
	"turn-failed": (event) => alert(`✗ error: ${event.message}`),
	"turn-cancelled": () => detail("Interrupted."),
};

const TURN_AFTER: Partial<Record<ScreenEvent["type"], Turn>> = {
	"turn-started": "thinking",
	tool: "working",
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

function applyEvents(conversation: Conversation, events: ScreenEvent[]): Conversation {
	const next = { ...conversation, lines: [...conversation.lines] };
	for (const event of events) {
		const line = lineOf(event.type, event);
		if (line) {
			next.lines.push(line);
		}
		next.streaming = streamingAfter(next.streaming, event);
		next.turn = TURN_AFTER[event.type] ?? next.turn;
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

export function useConversation(botId: string): Conversation {
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

	return conversation;
}
