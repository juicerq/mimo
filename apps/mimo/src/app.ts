import {
	BoxRenderable,
	InputRenderable,
	InputRenderableEvents,
	RenderableEvents,
	ScrollBoxRenderable,
	TextRenderable,
	type CliRenderer,
} from "@opentui/core";
import {
	resolveTextToResponses,
	type ActionResultStreamEvent,
	type ActionsRequestedStreamEvent,
	type InputOption,
	type InputRequest,
	type InputResolutionOutcome,
	type InputResolvedStreamEvent,
	type MessageStreamEvent,
} from "eve/client";
import { BotNameSchema, type Bot } from "@agent/bots";
import { PROVIDER_NAMES, type ModelInfo, type ModelOption, type ModelSelection } from "@agent/model-info";
import { describeError, type AgentChat, type BotChat } from "./agent";

const T1 = "#F2F2F3";
const T2 = "#C9C9CC";
const T3 = "#9A9A9E";
const T4 = "#6B6B6F";
const T5 = "#424246";
const TEXT_COLOR = T1;
const USER_COLOR = T3;
const TOOL_COLOR = T4;
const ERROR_COLOR = T1;
const STATUS_COLOR = T4;
const ATTENTION_COLOR = T1;
const FOLLOW_RESTART_MS = 2_000;
const DOUBLE_ESCAPE_MS = 400;

type BotMode = "normal" | "autonomous";
type PickerScreen =
	| { kind: "models"; bot: Bot; options: ModelOption[] }
	| { kind: "effort"; bot: Bot; option: ModelOption };
type Screen =
	| { kind: "bots"; bots: Bot[] }
	| { kind: "conversation"; bot: Bot }
	| PickerScreen
	| { kind: "saving" };

const RESOLUTION_TEXT: Record<InputResolutionOutcome, string> = {
	approved: "approved",
	denied: "denied",
	answered: "answered",
	ignored: "ignored",
	invalid: "invalid",
};

export class MimoApp {
	private readonly chat: AgentChat;
	private readonly renderer: CliRenderer;
	private readonly transcript: ScrollBoxRenderable;
	private readonly status: TextRenderable;
	private readonly input: InputRenderable;
	private readonly heading: TextRenderable;
	private conversation: BotChat | null = null;
	private screen: Screen = { kind: "bots", bots: [] };
	private view = new AbortController();
	private reply: TextRenderable | null = null;
	private replyText = "";
	private busy = false;
	private failed = false;
	private following: AbortSignal | null = null;
	private mode: BotMode = "normal";
	private lastState = "";
	private modelInfo: ModelInfo | null = null;
	private lastFailure: string | null = null;
	private contextUsed: number | null = null;
	private pendingRequests: InputRequest[] = [];
	private activeTurnId: string | null = null;
	private lastEscapeAt: number | null = null;
	private sessionEnded = false;
	private readonly receivedTurns = new Set<string>();

	constructor(renderer: CliRenderer, chat: AgentChat) {
		this.renderer = renderer;
		this.chat = chat;
		this.heading = new TextRenderable(renderer, {
			id: "heading",
			content: "bots",
			fg: T3,
		});
		const headingRow = new BoxRenderable(renderer, { width: "100%", paddingLeft: 2, flexShrink: 0 });
		headingRow.add(this.heading);

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
			fg: STATUS_COLOR,
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
		renderer.keyInput.on("keypress", (key) => {
			if (key.name === "escape") {
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
		container.add(headingRow);
		container.add(this.transcript);
		container.add(composer);
		container.add(statusRow);
		renderer.root.add(container);
	}

	async start(): Promise<void> {
		this.input.focus();
		this.setStatus("connecting");
		const problem = await this.chat.connectionProblem();
		if (problem === null) {
			await this.showBots();
			return;
		}
		this.appendLine(`✗ agent unavailable: ${problem}`, ERROR_COLOR);
		this.setStatus("offline");
	}

	private submit(value: string): void {
		const text = value.trim();
		if (this.navigate(text)) {
			return;
		}
		if (this.busy || text.length === 0) {
			return;
		}
		if (this.screen.kind === "models" || this.screen.kind === "effort") {
			this.selectOption(text);
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
		const responses = resolveTextToResponses(text, this.pendingRequests);
		if (responses.length > 0) {
			void this.dispatch(() => conversation.respond(responses));
			return;
		}
		void this.dispatch(() => conversation.send(text));
	}

	private handleEscape() {
		if (this.screen.kind === "models" || this.screen.kind === "effort") {
			this.lastEscapeAt = null;
			this.cancelSelection();
			return;
		}
		if (this.screen.kind !== "conversation" || (!this.busy && this.pendingRequests.length === 0)
			|| this.lastState === "cancelling") {
			this.lastEscapeAt = null;
			return;
		}
		const now = performance.now();
		if (this.lastEscapeAt !== null && now - this.lastEscapeAt <= DOUBLE_ESCAPE_MS) {
			this.lastEscapeAt = null;
			void this.cancelTurn(this.activeTurnId);
			return;
		}
		this.lastEscapeAt = now;
	}

	private async cancelTurn(turnId: string | null) {
		const conversation = this.conversation;
		if (!conversation) {
			return;
		}
		const signal = this.view.signal;
		const previousState = this.lastState;
		this.setStatus("cancelling");
		try {
			if (!turnId && this.pendingRequests.length === 0) {
				this.setStatus(previousState);
				return;
			}
			const result = await conversation.cancel(this.pendingRequests.length > 0 ? null : turnId);
			if (!signal.aborted && result.status === "no_active_turn" && this.lastState === "cancelling") {
				this.setStatus(previousState);
			}
		} catch (error) {
			if (!signal.aborted) {
				this.appendLine(`✗ could not interrupt: ${describeError(error)}`, ERROR_COLOR);
				if (this.lastState === "cancelling") {
					this.setStatus(previousState);
				}
			}
		}
	}

	private navigate(text: string) {
		if (this.screen.kind === "saving") {
			return true;
		}
		if (text === "/bots") {
			void this.showBots();
			return true;
		}
		if (text === "/cancel") {
			this.cancelSelection();
			return true;
		}
		if (text === "/model") {
			this.input.value = "";
			if (this.screen.kind === "bots") {
				this.appendLine("Open a bot to choose its model.", T3);
				return true;
			}
			void this.showModels(this.screen.bot);
			return true;
		}
		return false;
	}

	private cancelSelection() {
		if (this.screen.kind === "models" || this.screen.kind === "effort") {
			void this.openBot(this.screen.bot);
		}
	}

	private selectOption(text: string) {
		const screen = this.screen;
		this.input.value = "";
		if (!/^[1-9]\d*$/.test(text)) {
			this.appendLine("Choose a number, or /cancel to return.", T3);
			return;
		}
		const index = Number(text) - 1;
		if (screen.kind === "models") {
			const option = screen.options[index];
			if (option) {
				this.showEfforts(screen.bot, option);
				return;
			}
		}
		if (screen.kind === "effort") {
			const reasoning = screen.option.reasoningOptions[index];
			if (reasoning) {
				void this.saveModel(screen.bot, { provider: screen.option.provider, id: screen.option.id, reasoning });
				return;
			}
		}
		this.appendLine("Choose one of the listed numbers.", T3);
	}

	private async showModels(bot: Bot) {
		const signal = this.resetView({ kind: "models", bot, options: [] });
		this.heading.content = `${bot.name}  ·  model`;
		this.input.placeholder = "number or /cancel";
		try {
			const catalog = await this.chat.models();
			if (signal.aborted) {
				return;
			}
			this.screen = { kind: "models", bot, options: catalog.models };
			for (const [index, option] of catalog.models.entries()) {
				this.appendLine(`${index + 1}. ${option.name} · ${PROVIDER_NAMES[option.provider]}`, T2, 0);
			}
			for (const error of catalog.errors) {
				this.appendLine(`${PROVIDER_NAMES[error.provider]}: ${error.message}`, T3);
			}
			this.appendLine("/cancel to return", T4);
			this.transcript.scrollTo(0);
			this.busy = false;
			this.setStatus("ready");
		} catch (error) {
			if (!signal.aborted) {
				this.renderFailure(describeError(error));
			}
		}
	}

	private showEfforts(bot: Bot, option: ModelOption) {
		if (option.reasoningOptions.length === 1) {
			void this.saveModel(bot, { provider: option.provider, id: option.id, reasoning: option.reasoningOptions[0] });
			return;
		}
		this.resetView({ kind: "effort", bot, option });
		this.heading.content = `${option.name}  ·  effort`;
		this.input.placeholder = "number or /cancel";
		for (const [index, effort] of option.reasoningOptions.entries()) {
			this.appendLine(`${index + 1}. ${effort}`, T2, 0);
		}
		this.appendLine("/cancel to return", T4);
		this.busy = false;
		this.setStatus("ready");
	}

	private async saveModel(bot: Bot, selection: ModelSelection) {
		const picker = this.screen;
		if (picker.kind !== "models" && picker.kind !== "effort") {
			return;
		}
		const signal = this.view.signal;
		this.screen = { kind: "saving" };
		this.busy = true;
		this.setStatus("loading");
		try {
			const updated = await this.chat.selectModel(bot.id, selection);
			if (signal.aborted) {
				return;
			}
			await this.openBot(updated, "Model saved for the next response.");
		} catch (error) {
			if (!signal.aborted) {
				this.screen = picker;
				this.renderFailure(describeError(error));
			}
		}
	}

	private resetView(screen: Exclude<Screen, { kind: "saving" }>) {
		this.screen = screen;
		this.view.abort();
		this.view = new AbortController();
		this.following = null;
		this.conversation = null;
		this.sealReply();
		for (const child of this.transcript.getChildren()) {
			child.destroyRecursively();
		}
		this.transcript.scrollTo(0);
		this.input.value = "";
		this.busy = true;
		this.failed = false;
		if (screen.kind === "bots" || screen.kind === "conversation") {
			this.mode = "normal";
			this.contextUsed = null;
		}
		this.modelInfo = screen.kind === "bots" ? null : screen.bot.model;
		this.lastFailure = null;
		this.pendingRequests = [];
		this.activeTurnId = null;
		this.lastEscapeAt = null;
		this.sessionEnded = false;
		this.receivedTurns.clear();
		this.setStatus("loading");
		return this.view.signal;
	}

	private async showBots() {
		const signal = this.resetView({ kind: "bots", bots: [] });
		this.heading.content = "bots";
		this.input.placeholder = "number or /new <name>";
		try {
			const bots = await this.chat.listBots();
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
			const bot = await this.chat.createBot(parsed.data);
			if (!signal.aborted) {
				await this.openBot(bot);
			}
		} catch (error) {
			if (!signal.aborted) {
				this.renderFailure(describeError(error));
			}
		}
	}

	private async openBot(bot: Bot, notice?: string) {
		const signal = this.resetView({ kind: "conversation", bot });
		this.heading.content = `${bot.name}  ·  /bots  /model`;
		this.input.placeholder = "write your prompt";
		try {
			const conversation = await this.chat.openBot(bot.id);
			const events = await conversation.snapshot(signal);
			if (signal.aborted) {
				return;
			}
			this.conversation = conversation;
			this.screen = { kind: "conversation", bot: conversation.bot };
			this.modelInfo = conversation.bot.model;
			this.busy = false;
			this.setStatus("ready");
			for (const event of events) {
				this.renderEvent(event);
			}
			if (notice) {
				this.appendLine(notice, T3);
			}
			void this.follow();
		} catch (error) {
			if (!signal.aborted) {
				this.renderFailure(describeError(error));
			}
		}
	}

	private async dispatch(operation: () => Promise<Bot | void>): Promise<void> {
		const signal = this.view.signal;
		const input = this.input.value;
		this.input.value = "";
		this.failed = false;
		this.lastFailure = null;
		this.busy = true;
		this.setStatus("thinking");
		try {
			const bot = await operation();
			if (!signal.aborted && bot && bot.sessionId !== this.conversation?.bot.sessionId) {
				await this.openBot(bot, bot.previousSessionId ? "New session. Previous session data is available to the bot." : undefined);
				return;
			}
		} catch (error) {
			if (!signal.aborted) {
				if (!this.input.value) {
					this.input.value = input;
				}
				this.renderFailure(describeError(error));
			}
			return;
		}
		if (!signal.aborted) {
			await this.follow();
		}
	}

	private async follow(): Promise<void> {
		const signal = this.view.signal;
		const conversation = this.conversation;
		if (this.following === signal || !conversation) {
			return;
		}
		this.following = signal;
		let reported = false;
		try {
			while (!signal.aborted) {
				try {
					if (this.sessionEnded) {
						const current = await this.chat.openBot(conversation.bot.id);
						if (!signal.aborted && current.bot.sessionId !== conversation.bot.sessionId) {
							await this.openBot(current.bot, "New session. Previous history, memory and routines are available.");
							return;
						}
						await Bun.sleep(FOLLOW_RESTART_MS);
						continue;
					}
					const stream = conversation.stream(signal);
					if (stream === null) {
						return;
					}
					for await (const event of stream) {
						if (signal.aborted) {
							return;
						}
						reported = false;
						this.renderEvent(event);
						if (this.sessionEnded) {
							break;
						}
					}
				} catch (error) {
					if (signal.aborted) {
						return;
					}
					if (!reported) {
						reported = true;
						this.appendLine(`✗ stream dropped: ${describeError(error)}`, ERROR_COLOR);
					}
				}
				await Bun.sleep(FOLLOW_RESTART_MS);
			}
		} finally {
			if (this.following === signal) {
				this.following = null;
			}
		}
	}

	private renderEvent(event: MessageStreamEvent): void {
		switch (event.type) {
			case "message.received":
				if (this.receivedTurns.has(event.data.turnId)) {
					return;
				}
				this.receivedTurns.add(event.data.turnId);
				this.sealReply();
				this.appendLine(`you: ${event.data.message}`, USER_COLOR);
				return;
			case "message.appended":
				this.appendReplyDelta(event.data.messageDelta);
				return;
			case "message.completed":
				this.completeReply(event.data.message);
				return;
			case "step.completed": {
				const usage = event.data.usage;
				if (usage?.inputTokens !== undefined) {
					this.contextUsed = usage.inputTokens + (usage.outputTokens ?? 0);
					this.setStatus(this.lastState);
				}
				return;
			}
			case "actions.requested":
				this.renderActions(event.data.actions);
				return;
			case "action.result":
				this.renderActionResult(event.data);
				return;
			case "input.requested":
				this.renderInputRequests(event.data.requests);
				return;
			case "input.resolved":
				this.renderInputResolutions(event.data.resolutions);
				return;
			case "session.waiting":
				this.renderWaiting();
				return;
			default:
				this.renderLifecycle(event);
		}
	}

	private renderLifecycle(event: MessageStreamEvent): void {
		switch (event.type) {
			case "turn.started":
				this.activeTurnId = event.data.turnId;
				this.lastEscapeAt = null;
				this.failed = false;
				this.lastFailure = null;
				this.busy = true;
				this.setStatus("thinking");
				return;
			case "turn.completed":
				this.activeTurnId = null;
				this.busy = false;
				return;
			case "session.completed":
				if (this.pendingRequests.length > 0) {
					this.appendLine("Interrupted. The next message starts a new session.", T3);
				}
				this.sessionEnded = true;
				this.pendingRequests = [];
				this.activeTurnId = null;
				this.busy = false;
				this.setStatus("ended");
				return;
			case "session.failed":
				this.sessionEnded = true;
				this.pendingRequests = [];
				this.activeTurnId = null;
				this.renderFailure(event.data.message);
				return;
			case "step.failed":
			case "turn.failed":
				this.renderFailure(event.data.message);
				return;
			case "turn.cancelled":
				this.pendingRequests = [];
				this.activeTurnId = null;
				this.sealReply();
				this.appendLine("Interrupted.", T3);
				this.busy = false;
				this.setStatus("cancelled");
				return;
			default:
				return;
		}
	}

	private renderActions(actions: ActionsRequestedStreamEvent["data"]["actions"]): void {
		for (const action of actions) {
			const label = action.kind === "tool-call" ? action.toolName : action.kind;
			this.appendLine(`⚙ ${label}`, TOOL_COLOR);
		}
	}

	private renderActionResult(data: ActionResultStreamEvent["data"]): void {
		const mode = modeFromToolResult(data.result);
		if (mode !== null) {
			this.mode = mode;
			this.setStatus(this.lastState);
		}
		if (data.status === "failed" && data.error) {
			this.appendLine(`✗ tool failed: ${data.error.message}`, ERROR_COLOR);
		}
	}

	private renderFailure(message: string): void {
		this.busy = false;
		this.failed = true;
		if (this.lastFailure !== message) {
			this.lastFailure = message;
			const hint = message.startsWith("Insufficient balance") ? " Use /model to choose another provider, then continue the conversation." : "";
			this.appendLine(`✗ error: ${message}${hint}`, ERROR_COLOR);
		}
		this.setStatus("error");
	}

	private renderInputRequests(requests: readonly InputRequest[]): void {
		for (const request of requests) {
			this.pendingRequests.push(request);
			this.renderRequest(request);
		}
		this.busy = false;
		this.setStatus("waiting");
	}

	private renderInputResolutions(resolutions: InputResolvedStreamEvent["data"]["resolutions"]): void {
		for (const resolution of resolutions) {
			this.pendingRequests = this.pendingRequests.filter(
				(request) => request.requestId !== resolution.requestId,
			);
			this.appendLine(`⏸ ${RESOLUTION_TEXT[resolution.outcome]}`, TOOL_COLOR);
		}
		if (resolutions.length > 0) {
			this.busy = true;
			this.setStatus("thinking");
		}
	}

	private renderWaiting(): void {
		this.busy = false;
		if (this.lastState === "cancelled") {
			return;
		}
		if (this.failed) {
			this.setStatus("error");
		} else if (this.pendingRequests.length > 0) {
			this.setStatus("waiting");
		} else {
			this.setStatus("ready");
		}
	}

	private renderRequest(request: InputRequest): void {
		if (request.kind === "tool-approval") {
			this.appendLine(`▌ ⏸ approval: ${request.action.toolName}`, ATTENTION_COLOR);
			const input = JSON.stringify(request.action.input);
			if (input !== "{}") {
				this.appendLine(`   ${truncate(input, 240)}`, TOOL_COLOR);
			}
			this.appendLine(`   ${optionLine(request.options ?? [])}`, TEXT_COLOR);
			return;
		}
		this.appendLine(`▌ ⏸ ${request.prompt}`, ATTENTION_COLOR);
		const options = request.options ?? [];
		if (options.length > 0) {
			this.appendLine(`   ${optionLine(options)}`, TEXT_COLOR);
			return;
		}
		if (request.allowFreeform !== false) {
			this.appendLine("   responda com o texto", TOOL_COLOR);
		}
	}

	private appendReplyDelta(delta: string): void {
		const block = this.ensureReply();
		this.replyText += delta;
		block.content = this.replyText;
	}

	private completeReply(message: string | null): void {
		if (message !== null) {
			const block = this.ensureReply();
			this.replyText = message;
			block.content = message;
		}
		this.sealReply();
	}

	private ensureReply(): TextRenderable {
		if (this.reply) {
			return this.reply;
		}
		this.replyText = "";
		this.reply = this.appendLine("");
		return this.reply;
	}

	private sealReply(): void {
		this.reply = null;
		this.replyText = "";
	}

	private appendLine(content: string, fg = TEXT_COLOR, marginBottom = 1): TextRenderable {
		const line = new TextRenderable(this.renderer, {
			content,
			fg,
			width: "100%",
			wrapMode: "word",
			marginBottom,
		});
		this.transcript.add(line);
		return line;
	}

	private setStatus(state: string): void {
		this.lastState = state;
		const label = this.mode === "autonomous" ? "auto" : "normal";
		const parts: string[] = [];
		const used = this.contextUsed === null ? "0" : formatTokens(this.contextUsed);
		const modelInfo = this.modelInfo;
		const contextWindow = modelInfo?.contextWindowTokens;
		const capacity = contextWindow === undefined ? "—" : formatTokens(contextWindow);
		parts.push(`context: ${used}/${capacity}`);
		const model = modelInfo?.name ?? "—";
		const reasoning = modelInfo?.reasoning;
		const effort = reasoning === "provider-default" ? "default" : (reasoning ?? "default");
		parts.push(`model: ${model} (${effort})`);
		parts.push(`mode: ${label}`, `status: ${state}`);
		this.status.content = parts.join(" | ");
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

function modeFromToolResult(result: ActionResultStreamEvent["data"]["result"]): BotMode | null {
	if (result.kind !== "tool-result" || result.toolName !== "set_mode" || result.isError === true) {
		return null;
	}
	const output = result.output;
	if (typeof output !== "object" || output === null || !("mode" in output)) {
		return null;
	}
	const mode = output["mode"];
	if (mode === "normal" || mode === "autonomous") {
		return mode;
	}
	return null;
}

function optionLine(options: readonly InputOption[]): string {
	return options.map((option, index) => `${index + 1}. ${optionLabel(option)}`).join("   ");
}

function optionLabel(option: InputOption): string {
	switch (option.id) {
		case "approve":
			return "Approve";
		case "cancel":
			return "Cancel";
		default:
			return option.label;
	}
}

function truncate(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max)}…`;
}
