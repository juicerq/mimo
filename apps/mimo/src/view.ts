import type { Approval, BotEvent, TeamCall, ToolGroup } from "@agent/bot/types";
import type { Bar } from "./bar";
import type { Footer } from "./footer";
import type { Panel } from "./panel";
import { loginPanel } from "./panels/login";
import type { Transcript } from "./transcript";
import type { Turn } from "./turn";
import { T1, T3, T4 } from "./theme";

const TEAM_VERBS = { created: "created", delegated: "delegated to", stopped: "stopped", deleted: "deleted" } as const;
const TOOL_EVENT_TYPES = ["tool", "team-call", "tool-result", "tool-warned", "tool-failed"] as const;
const TOOL_EVENTS = new Set<BotEvent["type"]>(TOOL_EVENT_TYPES);

type ToolEvent = Extract<BotEvent, { type: (typeof TOOL_EVENT_TYPES)[number] }>;

function isToolEvent(event: BotEvent): event is ToolEvent {
	return TOOL_EVENTS.has(event.type);
}

interface ViewParts {
	transcript: Transcript;
	footer: Footer;
	bar: Bar;
	turn: Turn;
	showPanel: (panel: Panel) => void;
	botName: () => string | undefined;
}

export class View {
	private readonly transcript: Transcript;
	private readonly footer: Footer;
	private readonly bar: Bar;
	private readonly turn: Turn;
	private readonly showPanel: (panel: Panel) => void;
	private readonly botName: () => string | undefined;
	private lastFailure: string | null = null;

	constructor(parts: ViewParts) {
		this.transcript = parts.transcript;
		this.footer = parts.footer;
		this.bar = parts.bar;
		this.turn = parts.turn;
		this.showPanel = parts.showPanel;
		this.botName = parts.botName;
	}

	show(event: BotEvent): void {
		if (isToolEvent(event)) {
			this.showToolEvent(event);
			return;
		}

		switch (event.type) {
			case "user":
				this.transcript.seal();
				this.transcript.note(`you: ${event.text}`, T3);
				return;
			case "queue":
				this.bar.queue(event.items);
				return;
			case "note":
				this.transcript.seal();
				this.transcript.note(`▌ ${event.text}`, T4);
				return;
			case "routine":
				this.showRoutine(event.name, event.prompt);
				return;
			case "reply-delta":
				this.transcript.replyDelta(event.delta);
				return;
			case "reply":
				this.transcript.reply(event.text);
				return;
			case "approval":
				this.showApproval(event.approval);
				return;
			case "login":
				this.showPanel(loginPanel(event.target, event.session));
				return;
			case "tools":
				this.showToolGroups(event.tools);
				return;
			case "approval-resolved":
				this.transcript.note(`⏸ ${event.outcome}`, T4);
				this.turn.enter("thinking");
				return;
			default:
				this.showTurnEvent(event);
		}
	}

	failure(message: string): void {
		if (this.lastFailure !== message) {
			this.lastFailure = message;
			this.transcript.note(`✗ error: ${message}`, T1);
		}
		this.turn.enter("error");
	}

	forget(): void {
		this.lastFailure = null;
	}

	private showToolEvent(event: ToolEvent): void {
		switch (event.type) {
			case "tool":
				this.showTool(event.toolName, event.input);
				return;
			case "team-call":
				this.showTeamCall(event.call);
				return;
			case "tool-result":
				this.transcript.result(event.output);
				return;
			case "tool-warned":
				this.transcript.seal();
				this.transcript.note(`⚠ ${event.message}`, T1);
				return;
			case "tool-failed":
				this.transcript.detailed(`✗ tool failed: ${event.message}`, T1);
		}
	}

	private showTurnEvent(event: Extract<BotEvent, { type: "usage" | "mode" | `turn-${string}` }>): void {
		switch (event.type) {
			case "usage":
				this.footer.context(event.contextTokens);
				return;
			case "mode":
				this.footer.mode(event.mode);
				return;
			case "turn-started":
				this.lastFailure = null;
				this.turn.start();
				return;
			case "turn-finished":
				this.turn.finish();
				return;
			case "turn-failed":
				this.failure(event.message);
				return;
			case "turn-cancelled":
				this.transcript.seal();
				this.transcript.note("Interrupted.", T3);
				this.turn.enter("cancelled");
		}
	}

	private showTool(toolName: string, input: unknown): void {
		this.turn.ranTool();
		this.transcript.tool(toolName, input);
	}

	private showTeamCall(call: TeamCall): void {
		this.transcript.seal();
		const task = call.task === undefined ? "" : ` · ${call.task}`;
		this.transcript.detailed(`▌ ${TEAM_VERBS[call.kind]} ${call.bot}${task}`, T4);
	}

	private showToolGroups(tools: readonly ToolGroup[]): void {
		this.transcript.seal();
		this.transcript.detailed(`tools: ${tools.length === 0 ? "none" : tools.join(", ")}`, T3);
	}

	private showRoutine(name: string, prompt: string): void {
		this.transcript.seal();
		this.transcript.detailed(`routine: ${name} started`, T3, prompt.replaceAll("\n", " "));
	}

	private showApproval(approval: Approval): void {
		const from = approval.bot === this.botName() ? "" : ` · ${approval.bot}`;
		this.transcript.note(`▌ ⏸ approval: ${approval.toolName}${from}`, T1);
		const input = JSON.stringify(approval.input);
		if (input !== "{}") {
			this.transcript.indented(input);
		}
		this.transcript.note("   1. Approve   2. Cancel", T1);
		this.turn.enter("waiting");
	}
}
