import {
	BoxRenderable,
	InputRenderable,
	InputRenderableEvents,
	RenderableEvents,
	ScrollBoxRenderable,
	TextRenderable,
	type CliRenderer,
} from "@opentui/core";
import { Bot } from "@agent/bot/bot";
import { createBot, listBots } from "@agent/bot/store";
import { BotNameSchema, type Approval, type BotEvent, type BotInfo, type BotMode } from "@agent/bot/types";
import { modelOption } from "@agent/model/catalog";
import type { ModelInfo, ModelSelection } from "@agent/model/types";
import { describeError } from "./errors";
import { Panels, type PanelResult } from "./panel";
import { accountsPanel, loginPanel, loginTargetsPanel } from "./screens/login";
import { effortPanel, modelPanel } from "./screens/model";
import { T1, T2, T3, T4, T5 } from "./theme";

const DOUBLE_ESCAPE_MS = 400;
const APPROVAL_INPUT_CHARACTERS = 240;
const DETAIL_CHARACTERS = 600;
const TOOL_VIEWS = ["names", "details", "hidden"] as const;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_MS = 100;
const FLASH_MS = 2000;
const WORKING_LABELS: Record<string, string> = { loading: "loading", thinking: "thinking", cancelling: "stopping" };

type ToolView = (typeof TOOL_VIEWS)[number];

type Screen =
	| { kind: "bots"; bots: BotInfo[] }
	| { kind: "conversation"; bot: BotInfo };

export class MimoApp {
	private readonly renderer: CliRenderer;
	private readonly transcript: ScrollBoxRenderable;
	private readonly status: TextRenderable;
	private readonly input: InputRenderable;
	private readonly panels: Panels;
	private conversation: Bot | null = null;
	private unsubscribe: (() => void) | null = null;
	private screen: Screen = { kind: "bots", bots: [] };
	private view = new AbortController();
	private reply: TextRenderable | null = null;
	private replyText = "";
	private busy = false;
	private failed = false;
	private mode: BotMode = "normal";
	private lastState = "";
	private modelInfo: ModelInfo | null = null;
	private lastFailure: string | null = null;
	private contextUsed: number | null = null;
	private approval: Approval | null = null;
	private toolView: ToolView = "names";
	private working: { line: TextRenderable; label: string; startedAt: number; timer: ReturnType<typeof setInterval> } | null = null;
	private toolRan = false;
	private botName = "";
	private readonly flashed = new Set<string>();
	private readonly flashTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private lastEscapeAt: number | null = null;

	constructor(renderer: CliRenderer) {
		this.renderer = renderer;
		this.transcript = new ScrollBoxRenderable(renderer, {
			id: "transcript",
			width: "100%",
			flexGrow: 1,
			minHeight: 0,
			paddingTop: 1,
			paddingBottom: 1,
			paddingLeft: 2,
			paddingRight: 2,
			stickyScroll: true,
			stickyStart: "bottom",
		});
		this.status = new TextRenderable(renderer, {
			id: "status",
			content: "",
			fg: T4,
			width: "100%",
		});
		const statusRow = new BoxRenderable(renderer, {
			id: "status-row",
			width: "100%",
			paddingLeft: 2,
			flexShrink: 0,
		});
		statusRow.add(this.status);
		this.input = new InputRenderable(renderer, {
			id: "composer",
			width: "100%",
			placeholder: "write your prompt",
			textColor: T2,
			cursorColor: T1,
			cursorStyle: { style: "line", blinking: true },
		});
		this.input.on(InputRenderableEvents.ENTER, (value) => {
			this.submit(value);
		});
		this.panels = new Panels(renderer, { input: this.input, refresh: this.refreshPanels, finish: this.closePanel });
		renderer.keyInput.on("keypress", (key) => {
			if (key.ctrl && key.name === "p" && this.screen.kind === "conversation" && this.conversation) {
				this.showModels(this.screen.bot);
			} else if (key.ctrl && key.name === "o") {
				this.cycleToolView();
			} else if (key.name === "c" && !key.ctrl && !key.meta && this.input.value.length === 0 && this.panels.copyLink()) {
				key.preventDefault();
				this.lastEscapeAt = null;
			} else if (key.name === "escape") {
				this.handleEscape();
			} else {
				this.lastEscapeAt = null;
			}
		});

		const composer = new BoxRenderable(renderer, {
			id: "composer-box",
			width: "100%",
			flexShrink: 0,
			border: true,
			borderStyle: "rounded",
			borderColor: T5,
			paddingLeft: 1,
			paddingRight: 1,
		});
		this.input.on(RenderableEvents.FOCUSED, () => {
			composer.borderColor = T4;
		});
		this.input.on(RenderableEvents.BLURRED, () => {
			composer.borderColor = T5;
		});
		composer.add(this.input);

		const container = new BoxRenderable(renderer, {
			id: "app",
			width: "100%",
			height: "100%",
			flexDirection: "column",
		});
		container.add(this.panels.row);
		container.add(this.transcript);
		container.add(this.panels.box);
		container.add(composer);
		container.add(statusRow);
		renderer.root.add(container);
	}

	async start(): Promise<void> {
		this.input.focus();
		const draft = this.input.value;
		const loading = this.showBots();
		this.input.value = draft;
		await loading;
	}

	private submit(value: string): void {
		const text = value.trim();
		if (this.navigate(text)) {
			return;
		}
		if (text.length === 0) {
			return;
		}
		if (this.panels.active) {
			this.panels.submit(text);
			return;
		}
		if (this.busy) {
			return;
		}
		if (/^\/new(?: |$)/.test(text)) {
			void this.createBot(text.slice(4).trim());
			return;
		}
		if (this.screen.kind === "bots") {
			const bot = this.screen.bots[Number(text) - 1];
			if (bot && /^[1-9]\d*$/.test(text)) {
				void this.openBot(bot);
			} else {
				this.appendLine("Choose a bot by number, or type /new <name>.", T3);
			}
			return;
		}
		const conversation = this.conversation;
		if (!conversation) {
			return;
		}
		void this.dispatch(async () => await conversation.deliver(text));
	}

	private handleEscape() {
		if (this.panels.active) {
			this.lastEscapeAt = null;
			this.panels.cancel();
			return;
		}
		if (this.screen.kind !== "conversation" || (!this.busy && this.approval === null)
			|| this.lastState === "cancelling") {
			this.lastEscapeAt = null;
			return;
		}
		const now = performance.now();
		if (this.lastEscapeAt !== null && now - this.lastEscapeAt <= DOUBLE_ESCAPE_MS) {
			this.lastEscapeAt = null;
			this.cancelTurn();
			return;
		}
		this.lastEscapeAt = now;
	}

	private cancelTurn() {
		this.setStatus("cancelling");
		this.conversation?.cancel();
	}

	private navigate(text: string) {
		if (this.panels.state === "saving") {
			return true;
		}
		if (text === "/bots") {
			void this.showBots();
			return true;
		}
		if (text === "/cancel") {
			this.panels.cancel();
			return true;
		}
		if (text === "/model") {
			this.input.value = "";
			this.showModels(this.screen.kind === "bots" ? null : this.screen.bot);
			return true;
		}
		if (text === "/effort") {
			this.input.value = "";
			this.showEfforts();
			return true;
		}
		if (text === "/login") {
			this.input.value = "";
			this.panels.show(loginTargetsPanel());
			return true;
		}
		if (text === "/logout") {
			this.input.value = "";
			this.panels.show(accountsPanel());
			return true;
		}
		return false;
	}

	private showModels(bot: BotInfo | null): void {
		if (!bot || !this.conversation) {
			this.appendLine("Open a bot to choose its model.", T3);
			return;
		}
		this.panels.show(modelPanel(bot, this.saveModel));
	}

	private showEfforts(): void {
		const screen = this.screen;
		if (screen.kind === "bots") {
			this.appendLine("Open a bot to choose its effort.", T3);
			return;
		}
		try {
			this.panels.show(effortPanel(modelOption(screen.bot.model), this.saveModel));
		} catch (error) {
			this.appendLine(describeError(error), T1);
		}
	}

	private readonly saveModel = async (selection: ModelSelection): Promise<BotInfo> => {
		return await this.requireConversation().selectModel(selection);
	};

	private readonly refreshPanels = (): void => {
		this.transcript.visible = !this.panels.active;
		this.setStatus(this.lastState);
	};

	private readonly closePanel = (result: PanelResult): void => {
		if (result.bot && this.screen.kind === "conversation") {
			this.screen = { kind: "conversation", bot: result.bot };
			this.modelInfo = result.bot.model;
		}
		this.input.placeholder = this.screen.kind === "bots" ? "number or /new <name>" : "write your prompt";
		if (result.message) {
			this.appendLine(result.message, T3);
		}
		this.setStatus(this.lastState);
	};

	private requireConversation(): Bot {
		if (!this.conversation) {
			throw new Error("Open a bot first.");
		}
		return this.conversation;
	}

	private resetView(screen: Screen) {
		this.panels.dismiss();
		this.transcript.visible = true;
		this.screen = screen;
		this.botName = screen.kind === "bots" ? "" : screen.bot.name;
		this.stopWorking();
		this.view.abort();
		this.view = new AbortController();
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.conversation = null;
		this.sealReply();
		for (const child of this.transcript.getChildren()) {
			child.destroyRecursively();
		}
		this.transcript.scrollTo(0);
		this.input.value = "";
		this.busy = true;
		this.failed = false;
		this.mode = "normal";
		this.contextUsed = null;
		this.modelInfo = screen.kind === "bots" ? null : screen.bot.model;
		this.lastFailure = null;
		this.approval = null;
		this.lastEscapeAt = null;
		this.setStatus("loading");
		return this.view.signal;
	}

	private async showBots() {
		const signal = this.resetView({ kind: "bots", bots: [] });
		this.input.placeholder = "number or /new <name>";
		try {
			const bots = await listBots();
			if (signal.aborted) {
				return;
			}
			this.screen = { kind: "bots", bots };
			for (const [index, bot] of bots.entries()) {
				this.appendLine(`${index + 1}. ${bot.name}`, T2);
			}
			this.appendLine(bots.length ? "/new <name> to create a bot" : "Create your first bot with /new <name>.", T4);
			this.busy = false;
			this.setStatus("ready");
		} catch (error) {
			if (!signal.aborted) {
				this.renderFailure(describeError(error));
			}
		}
	}

	private async createBot(name: string) {
		const parsed = BotNameSchema.safeParse(name);
		if (!parsed.success) {
			this.appendLine("Use /new <name> with 1–80 visible characters.", T3);
			return;
		}
		const signal = this.view.signal;
		this.busy = true;
		this.setStatus("loading");
		try {
			const bot = await createBot(parsed.data);
			if (!signal.aborted) {
				await this.openBot(bot);
			}
		} catch (error) {
			if (!signal.aborted) {
				this.renderFailure(describeError(error));
			}
		}
	}

	private async openBot(bot: BotInfo) {
		const signal = this.resetView({ kind: "conversation", bot });
		this.input.placeholder = "write your prompt";
		try {
			const conversation = await Bot.open(bot.id);
			if (signal.aborted) {
				return;
			}
			this.conversation = conversation;
			this.screen = { kind: "conversation", bot: conversation.info };
			this.modelInfo = conversation.info.model;
			this.mode = conversation.info.mode;
			this.busy = false;
			this.setStatus("ready");
			for (const event of conversation.transcript()) {
				this.renderEvent(event);
			}
			this.unsubscribe = conversation.subscribe((event) => {
				if (!signal.aborted) {
					this.renderEvent(event);
				}
			});
			const approval = conversation.approval;
			if (approval) {
				this.renderEvent({ type: "approval", approval });
			}
		} catch (error) {
			if (!signal.aborted) {
				this.renderFailure(describeError(error));
			}
		}
	}

	private async dispatch(operation: () => Promise<void>): Promise<void> {
		const signal = this.view.signal;
		const input = this.input.value;
		this.input.value = "";
		this.failed = false;
		this.lastFailure = null;
		this.busy = true;
		this.setStatus("thinking");
		try {
			await operation();
		} catch (error) {
			if (!signal.aborted) {
				if (!this.input.value) {
					this.input.value = input;
				}
				this.renderFailure(describeError(error));
			}
		}
	}

	private renderEvent(event: BotEvent): void {
		switch (event.type) {
			case "user":
				this.sealReply();
				this.appendLine(`you: ${event.text}`, T3);
				return;
			case "reply-delta":
				this.appendReplyDelta(event.delta);
				return;
			case "reply":
				this.completeReply(event.text);
				return;
			case "tool":
				this.renderTool(event.toolName, event.input);
				return;
			case "tool-result":
				this.appendDetail(event.output);
				return;
			case "tool-failed":
				this.appendLine(`✗ tool failed: ${event.message}`, T1);
				return;
			case "approval":
				this.renderApproval(event.approval);
				return;
			case "login":
				this.panels.show(loginPanel(event.target, event.session));
				return;
			case "approval-resolved":
				this.approval = null;
				this.appendLine(`⏸ ${event.outcome}`, T4);
				this.busy = true;
				this.setStatus("thinking");
				return;
			default:
				this.renderTurnEvent(event);
		}
	}

	private renderTurnEvent(event: Extract<BotEvent, { type: "usage" | "mode" | `turn-${string}` }>): void {
		switch (event.type) {
			case "usage":
				this.contextUsed = event.contextTokens;
				this.setStatus(this.lastState);
				return;
			case "mode":
				this.mode = event.mode;
				this.flash("mode");
				return;
			case "turn-started":
				this.lastEscapeAt = null;
				this.toolRan = false;
				this.failed = false;
				this.lastFailure = null;
				this.busy = true;
				this.setStatus("thinking");
				return;
			case "turn-finished":
				this.renderWaiting();
				return;
			case "turn-failed":
				this.renderFailure(event.message);
				return;
			case "turn-cancelled":
				this.approval = null;
				this.sealReply();
				this.appendLine("Interrupted.", T3);
				this.busy = false;
				this.setStatus("cancelled");
		}
	}

	private renderFailure(message: string): void {
		this.busy = false;
		this.failed = true;
		if (this.lastFailure !== message) {
			this.lastFailure = message;
			const hint = message.startsWith("Insufficient balance") ? " Use /model to choose another provider, then continue the conversation." : "";
			this.appendLine(`✗ error: ${message}${hint}`, T1);
		}
		this.setStatus("error");
	}

	private renderWaiting(): void {
		this.busy = false;
		if (this.lastState === "cancelled") {
			return;
		}
		if (this.failed) {
			this.setStatus("error");
		} else if (this.approval !== null) {
			this.setStatus("waiting");
		} else {
			this.setStatus("ready");
		}
	}

	private renderTool(toolName: string, input: unknown): void {
		this.toolRan = true;
		this.setStatus(this.lastState);
		if (this.toolView === "hidden") {
			return;
		}
		this.appendLine(`⚙ ${toolName}`, T4, this.toolView === "details" ? 0 : 1);
		this.appendDetail(JSON.stringify(input), 0);
	}

	private appendDetail(text: string | undefined, marginBottom = 1): void {
		const detail = text?.trim();
		if (this.toolView !== "details" || !detail || detail === "{}") {
			return;
		}
		this.appendLine(`   ${truncate(detail, DETAIL_CHARACTERS)}`, T4, marginBottom);
	}

	private cycleToolView(): void {
		const screen = this.screen;
		if (screen.kind !== "conversation" || !this.conversation) {
			return;
		}
		this.toolView = TOOL_VIEWS[(TOOL_VIEWS.indexOf(this.toolView) + 1) % TOOL_VIEWS.length];
		this.flash("tools");
		void this.openBot(screen.bot);
	}

	private renderApproval(approval: Approval): void {
		this.approval = approval;
		this.appendLine(`▌ ⏸ approval: ${approval.toolName}`, T1);
		const input = JSON.stringify(approval.input);
		if (input !== "{}") {
			this.appendLine(`   ${truncate(input, APPROVAL_INPUT_CHARACTERS)}`, T4);
		}
		this.appendLine("   1. Approve   2. Cancel", T1);
		this.busy = false;
		this.setStatus("waiting");
	}

	private appendReplyDelta(delta: string): void {
		const block = this.ensureReply();
		this.replyText += delta;
		block.content = `${this.botName}: ${this.replyText}`;
	}

	private completeReply(message: string): void {
		if (message !== "") {
			const block = this.ensureReply();
			this.replyText = message;
			block.content = `${this.botName}: ${message}`;
		}
		this.sealReply();
	}

	private ensureReply(): TextRenderable {
		if (this.reply) {
			return this.reply;
		}
		this.stopWorking();
		this.replyText = "";
		this.reply = this.appendLine(`${this.botName}: `);
		return this.reply;
	}

	private sealReply(): void {
		this.reply = null;
		this.replyText = "";
	}

	private appendLine(content: string, fg = T1, marginBottom = 1): TextRenderable {
		const line = new TextRenderable(this.renderer, {
			content,
			fg,
			width: "100%",
			wrapMode: "word",
			marginBottom,
		});
		this.transcript.add(line);
		this.raiseWorking();
		return line;
	}

	private setStatus(state: string): void {
		this.lastState = state;
		this.renderWorking(state);
		const parts: string[] = [];
		const used = this.contextUsed === null ? "0" : formatTokens(this.contextUsed);
		const modelInfo = this.modelInfo;
		const contextWindow = modelInfo?.contextWindowTokens;
		const capacity = contextWindow === undefined ? "—" : formatTokens(contextWindow);
		parts.push(`context: ${used}/${capacity}`);
		const model = modelInfo?.name ?? "—";
		parts.push(`model: ${model} (${modelInfo?.reasoning ?? "default"})`);
		if (this.flashed.has("mode")) {
			parts.push(`mode: ${this.mode === "autonomous" ? "auto" : "normal"}`);
		}
		if (this.flashed.has("tools")) {
			parts.push(`tools: ${this.toolView}`);
		}
		if (this.panels.active) {
			parts.push(`status: ${this.panels.state}`);
		}
		this.status.content = parts.join(" | ");
	}

	private flash(field: string): void {
		this.flashed.add(field);
		clearTimeout(this.flashTimers.get(field));
		this.flashTimers.set(field, setTimeout(() => {
			this.flashed.delete(field);
			this.setStatus(this.lastState);
		}, FLASH_MS));
		this.setStatus(this.lastState);
	}

	private renderWorking(state: string): void {
		const label = this.panels.active ? undefined : WORKING_LABELS[state];
		if (label === undefined) {
			this.stopWorking();
			return;
		}
		const working = this.working;
		if (working) {
			working.label = this.workingLabel(label);
			this.drawWorking();
			return;
		}
		const line = this.appendLine("", T4);
		this.working = {
			line,
			label: this.workingLabel(label),
			startedAt: performance.now(),
			timer: setInterval(() => this.drawWorking(), SPINNER_MS),
		};
		this.drawWorking();
	}

	private workingLabel(label: string): string {
		if (label === "thinking" && this.toolRan) {
			return "working";
		}
		return label;
	}

	private drawWorking(): void {
		const working = this.working;
		if (!working) {
			return;
		}
		const elapsed = performance.now() - working.startedAt;
		const frame = SPINNER[Math.floor(elapsed / SPINNER_MS) % SPINNER.length];
		const hint = working.label === "loading" ? "" : " · esc esc to stop";
		working.line.content = `${frame} ${working.label} · ${Math.floor(elapsed / 1000)}s${hint}`;
	}

	private stopWorking(): void {
		const working = this.working;
		if (!working) {
			return;
		}
		clearInterval(working.timer);
		this.working = null;
		this.transcript.remove(working.line);
		working.line.destroyRecursively();
	}

	private raiseWorking(): void {
		const working = this.working;
		if (!working) {
			return;
		}
		this.transcript.remove(working.line);
		this.transcript.add(working.line);
	}
}

function formatTokens(tokens: number): string {
	if (tokens < 1_000) {
		return String(tokens);
	}
	const thousands = tokens / 1_000;
	const text = Number.isInteger(thousands) ? String(thousands) : thousands.toFixed(1);
	return `${text}k`;
}

function truncate(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max)}…`;
}
