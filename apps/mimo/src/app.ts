import { BoxRenderable, InputRenderable, InputRenderableEvents, RenderableEvents, TextRenderable, type CliRenderer } from "@opentui/core";
import { Bot, deleteBot } from "@agent/bot/bot";
import { createBot, listBots } from "@agent/bot/store";
import { BotNameSchema, type Approval, type BotEvent, type BotInfo, type BotMode, type TeamCall, type TeamMember, type ToolGroup } from "@agent/bot/types";
import { modelOption } from "@agent/model/catalog";
import type { ModelInfo, ModelSelection } from "@agent/model/types";
import { describeError } from "./errors";
import { Panels, type PanelResult } from "./panel";
import { deletePanel } from "./screens/delete";
import { accountsPanel, loginPanel, loginTargetsPanel } from "./screens/login";
import { effortPanel, modelPanel } from "./screens/model";
import { toolsPanel } from "./screens/tools";
import { Transcript } from "./transcript";
import { Turn, type TurnState } from "./turn";
import { T1, T2, T3, T4, T5 } from "./theme";

const DOUBLE_ESCAPE_MS = 400;
const TEAM_VERBS = { created: "created", delegated: "delegated to", stopped: "stopped", deleted: "deleted" } as const;
const FLASH_MS = 2000;
const TEAM_MS = 1000;

type Screen =
	| { kind: "bots"; bots: BotInfo[] }
	| { kind: "conversation"; bot: BotInfo };

export class MimoApp {
	private readonly renderer: CliRenderer;
	private readonly transcript: Transcript;
	private readonly status: TextRenderable;
	private readonly input: InputRenderable;
	private readonly panels: Panels;
	private readonly queue: BoxRenderable;
	private readonly team: BoxRenderable;
	private teamLines: string[] = [];
	private teamTimer: ReturnType<typeof setInterval> | null = null;
	private conversation: Bot | null = null;
	private unsubscribe: (() => void) | null = null;
	private screen: Screen = { kind: "bots", bots: [] };
	private view = new AbortController();
	private readonly turn = new Turn();
	private mode: BotMode = "normal";
	private modelInfo: ModelInfo | null = null;
	private lastFailure: string | null = null;
	private contextUsed: number | null = null;
	private readonly flashed = new Set<string>();
	private readonly flashTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private lastEscapeAt: number | null = null;

	constructor(renderer: CliRenderer) {
		this.renderer = renderer;
		this.transcript = new Transcript(renderer);
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
				this.cycleDetail();
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

		this.team = new BoxRenderable(renderer, {
			id: "team",
			width: "100%",
			flexDirection: "column",
			flexShrink: 0,
			paddingLeft: 2,
		});
		this.queue = new BoxRenderable(renderer, {
			id: "queue",
			width: "100%",
			flexDirection: "column",
			flexShrink: 0,
			paddingLeft: 2,
		});

		const container = new BoxRenderable(renderer, {
			id: "app",
			width: "100%",
			height: "100%",
			flexDirection: "column",
		});
		container.add(this.panels.row);
		container.add(this.transcript.box);
		container.add(this.panels.box);
		container.add(this.team);
		container.add(this.queue);
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
		if (this.turn.busy && this.screen.kind === "bots") {
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
				this.transcript.note("Choose a bot by number, or type /new <name>.", T3);
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
		if (this.screen.kind !== "conversation" || this.turn.idle || this.turn.state === "cancelling") {
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
		this.enter("cancelling");
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
		if (text === "/tools") {
			this.input.value = "";
			this.showTools();
			return true;
		}
		if (text === "/effort") {
			this.input.value = "";
			this.showEfforts();
			return true;
		}
		if (text === "/delete") {
			this.input.value = "";
			this.panels.show(deletePanel(this.removeBot));
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
			this.transcript.note("Open a bot to choose its model.", T3);
			return;
		}
		this.panels.show(modelPanel(bot, this.saveModel));
	}

	private showEfforts(): void {
		const screen = this.screen;
		if (screen.kind === "bots") {
			this.transcript.note("Open a bot to choose its effort.", T3);
			return;
		}
		try {
			this.panels.show(effortPanel(modelOption(screen.bot.model), this.saveModel));
		} catch (error) {
			this.transcript.note(describeError(error), T1);
		}
	}

	private showTools(): void {
		const screen = this.screen;
		if (screen.kind === "bots") {
			this.transcript.note("Open a bot to choose its tools.", T3);
			return;
		}
		this.panels.show(toolsPanel(screen.bot, this.saveTools));
	}

	private readonly saveTools = async (tools: ToolGroup[]): Promise<BotInfo> => {
		const bot = await this.requireConversation().setTools(tools);
		this.screen = { kind: "conversation", bot };
		return bot;
	};

	private readonly saveModel = async (selection: ModelSelection): Promise<BotInfo> => {
		return await this.requireConversation().selectModel(selection);
	};

	private readonly removeBot = async (bot: BotInfo): Promise<void> => {
		await deleteBot(bot.id);
	};

	private readonly refreshPanels = (): void => {
		this.transcript.box.visible = !this.panels.active;
		this.refresh();
	};

	private readonly closePanel = (result: PanelResult): void => {
		if (result.list) {
			void this.showBots(result.message);
			return;
		}
		if (result.bot && this.screen.kind === "conversation") {
			this.screen = { kind: "conversation", bot: result.bot };
			this.modelInfo = result.bot.model;
		}
		this.input.placeholder = this.screen.kind === "bots" ? "number or /new <name>" : "write your prompt";
		if (result.message) {
			this.transcript.note(result.message, T3);
		}
		this.refresh();
	};

	private requireConversation(): Bot {
		if (!this.conversation) {
			throw new Error("Open a bot first.");
		}
		return this.conversation;
	}

	private resetView(screen: Screen) {
		this.panels.dismiss();
		this.transcript.box.visible = true;
		this.screen = screen;
		this.transcript.clear(screen.kind === "bots" ? "" : screen.bot.name);
		this.view.abort();
		this.view = new AbortController();
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.conversation = null;
		this.input.value = "";
		this.mode = "normal";
		this.contextUsed = null;
		this.modelInfo = screen.kind === "bots" ? null : screen.bot.model;
		this.lastFailure = null;
		this.lastEscapeAt = null;
		this.renderQueue([]);
		this.stopTeam();
		this.enter("loading");
		return this.view.signal;
	}

	private async showBots(note?: string) {
		const signal = this.resetView({ kind: "bots", bots: [] });
		this.input.placeholder = "number or /new <name>";
		try {
			const bots = await listBots();
			if (signal.aborted) {
				return;
			}
			this.screen = { kind: "bots", bots };
			for (const [index, bot] of bots.entries()) {
				this.transcript.note(`${index + 1}. ${bot.name}`, T2);
			}
			this.transcript.note(bots.length ? "/new <name> to create a bot, /delete to remove one" : "Create your first bot with /new <name>.", T4);
			if (note) {
				this.transcript.note(note, T3);
			}
			this.enter("ready");
		} catch (error) {
			if (!signal.aborted) {
				this.renderFailure(describeError(error));
			}
		}
	}

	private async createBot(name: string) {
		const parsed = BotNameSchema.safeParse(name);
		if (!parsed.success) {
			this.transcript.note("Use /new <name> with 1–80 visible characters.", T3);
			return;
		}
		const signal = this.view.signal;
		this.enter("loading");
		try {
			const bot = await createBot({ name: parsed.data });
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
			this.enter("ready");
			for (const event of conversation.transcript()) {
				this.renderEvent(event);
			}
			this.renderQueue(conversation.queue);
			this.teamTimer = setInterval(() => this.renderTeam(), TEAM_MS);
			this.transcript.toBottom();
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
		this.lastFailure = null;
		if (this.turn.idle) {
			this.turn.start();
			this.refresh();
		}
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
				this.transcript.seal();
				this.transcript.note(`you: ${event.text}`, T3);
				return;
			case "queue":
				this.renderQueue(event.items);
				return;
			case "note":
				this.transcript.seal();
				this.transcript.note(`▌ ${event.text}`, T4);
				return;
			case "routine":
				this.renderRoutine(event.name, event.prompt);
				return;
			case "reply-delta":
				this.transcript.replyDelta(event.delta);
				return;
			case "reply":
				this.transcript.reply(event.text);
				return;
			case "tool":
				this.renderTool(event.toolName, event.input);
				return;
			case "team-call":
				this.renderTeamCall(event.call);
				return;
			case "tool-result":
				this.transcript.result(event.output);
				return;
			case "tool-failed":
				this.transcript.detailed(`✗ tool failed: ${event.message}`, T1);
				return;
			case "approval":
				this.renderApproval(event.approval);
				return;
			case "login":
				this.panels.show(loginPanel(event.target, event.session));
				return;
			case "tools":
				this.renderTools(event.tools);
				return;
			case "approval-resolved":
				this.transcript.note(`⏸ ${event.outcome}`, T4);
				this.enter("thinking");
				return;
			default:
				this.renderTurnEvent(event);
		}
	}

	private renderTurnEvent(event: Extract<BotEvent, { type: "usage" | "mode" | `turn-${string}` }>): void {
		switch (event.type) {
			case "usage":
				this.contextUsed = event.contextTokens;
				this.refresh();
				return;
			case "mode":
				this.mode = event.mode;
				this.flash("mode");
				return;
			case "turn-started":
				this.lastEscapeAt = null;
				this.lastFailure = null;
				this.turn.start();
				this.refresh();
				return;
			case "turn-finished":
				this.turn.finish();
				this.refresh();
				return;
			case "turn-failed":
				this.renderFailure(event.message);
				return;
			case "turn-cancelled":
				this.transcript.seal();
				this.transcript.note("Interrupted.", T3);
				this.enter("cancelled");
		}
	}

	private renderTeamCall(call: TeamCall): void {
		this.transcript.seal();
		this.transcript.detailed(`▌ ${TEAM_VERBS[call.kind]} ${call.bot}`, T4);
	}

	private renderTools(tools: readonly ToolGroup[]): void {
		this.transcript.seal();
		this.transcript.detailed(`tools: ${tools.length === 0 ? "none" : tools.join(", ")}`, T3);
	}

	private renderQueue(items: readonly string[]): void {
		this.fill(this.queue, items.map((item) => `queue: ${item}`));
	}

	private fill(box: BoxRenderable, lines: string[]): void {
		for (const child of box.getChildren()) {
			child.destroyRecursively();
		}
		for (const line of lines) {
			box.add(new TextRenderable(this.renderer, {
				content: line,
				fg: T4,
				width: "100%",
				wrapMode: "word",
			}));
		}
	}

	private stopTeam(): void {
		if (this.teamTimer !== null) {
			clearInterval(this.teamTimer);
			this.teamTimer = null;
		}
		this.teamLines = [];
		this.fill(this.team, []);
	}

	private renderTeam(): void {
		const lines = (this.conversation?.team ?? []).map(teamLine);
		if (lines.length === this.teamLines.length && lines.every((line, index) => line === this.teamLines[index])) {
			return;
		}
		this.teamLines = lines;
		this.fill(this.team, lines);
	}

	private renderFailure(message: string): void {
		if (this.lastFailure !== message) {
			this.lastFailure = message;
			const hint = message.startsWith("Insufficient balance") ? " Use /model to choose another provider, then continue the conversation." : "";
			this.transcript.note(`✗ error: ${message}${hint}`, T1);
		}
		this.enter("error");
	}

	private renderTool(toolName: string, input: unknown): void {
		this.turn.ranTool();
		this.refresh();
		this.transcript.tool(toolName, input);
	}

	private renderRoutine(name: string, prompt: string): void {
		this.transcript.seal();
		this.transcript.detailed(`routine: ${name} started`, T3, prompt.replaceAll("\n", " "));
	}

	private cycleDetail(): void {
		const screen = this.screen;
		if (screen.kind !== "conversation" || !this.conversation) {
			return;
		}
		this.transcript.cycle();
		this.flash("detail");
		void this.openBot(screen.bot);
	}

	private renderApproval(approval: Approval): void {
		const from = this.screen.kind === "conversation" && approval.bot === this.screen.bot.name ? "" : ` · ${approval.bot}`;
		this.transcript.note(`▌ ⏸ approval: ${approval.toolName}${from}`, T1);
		const input = JSON.stringify(approval.input);
		if (input !== "{}") {
			this.transcript.indented(input);
		}
		this.transcript.note("   1. Approve   2. Cancel", T1);
		this.enter("waiting");
	}

	private enter(state: TurnState): void {
		this.turn.enter(state);
		this.refresh();
	}

	private refresh(): void {
		this.transcript.working(this.panels.active ? undefined : this.turn.label);
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
		if (this.flashed.has("detail")) {
			parts.push(`detail: ${this.transcript.level}`);
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
			this.refresh();
		}, FLASH_MS));
		this.refresh();
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

function teamLine(member: TeamMember): string {
	const seconds = Math.floor((Date.now() - member.startedAt) / 1000);
	const elapsed = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
	return `team: ${member.name} · ${elapsed} · ${member.tool ?? "thinking"}`;
}

