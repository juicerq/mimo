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
import { disconnectAccount, listAccounts } from "@agent/gmail/accounts";
import { listModels, modelOption } from "@agent/model/catalog";
import { LOGIN_GROUP_NAMES, LOGIN_TARGETS, LoginSession, type LoginEvent, type LoginGroup, type LoginPrompt, type LoginTarget } from "@agent/login/login";
import { PROVIDER_NAMES, ProviderSchema, type ModelCatalog, type ModelInfo, type ModelOption, type ModelSelection, type Provider } from "@agent/model/types";
import { copyToClipboard } from "./clipboard";

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
const DOUBLE_ESCAPE_MS = 400;
const APPROVAL_INPUT_CHARACTERS = 240;
const DETAIL_CHARACTERS = 600;

type HomeScreen =
	| { kind: "bots"; bots: BotInfo[] }
	| { kind: "conversation"; bot: BotInfo };
type PickerScreen =
	| { kind: "catalog"; bot: BotInfo; catalog: ModelCatalog }
	| { kind: "models"; bot: BotInfo; options: ModelOption[] }
	| { kind: "effort"; bot: BotInfo; option: ModelOption }
	| { kind: "providers" }
	| { kind: "accounts"; emails: string[] }
	| { kind: "login"; target: LoginTarget; session: LoginSession; url: string | null; prompt: LoginPrompt | null };
type Screen = HomeScreen | PickerScreen | { kind: "saving" };

const PICKER_KINDS = new Set(["catalog", "models", "effort", "providers", "accounts", "login"]);

function isPicker(screen: Screen): screen is PickerScreen {
	return PICKER_KINDS.has(screen.kind);
}

export class MimoApp {
	private readonly renderer: CliRenderer;
	private readonly transcript: ScrollBoxRenderable;
	private readonly status: TextRenderable;
	private readonly input: InputRenderable;
	private readonly heading: TextRenderable;
	private readonly pickerTranscript: ScrollBoxRenderable;
	private picker: { view: AbortController; draft: string; state: string; back: HomeScreen } | null = null;
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
	private details = false;
	private lastEscapeAt: number | null = null;

	constructor(renderer: CliRenderer) {
		this.renderer = renderer;
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
		this.pickerTranscript = new ScrollBoxRenderable(renderer, {
			width: "100%", flexGrow: 1, minHeight: 0, paddingTop: 1,
			paddingLeft: 2, paddingRight: 2, visible: false,
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
			if (key.ctrl && key.name === "p" && this.screen.kind === "conversation" && this.conversation) {
				void this.showModels(this.screen.bot);
			} else if (key.ctrl && key.name === "o") {
				this.toggleDetails();
			} else if (key.name === "c" && !key.ctrl && !key.meta && this.copyAuthUrl()) {
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
		container.add(headingRow);
		container.add(this.transcript);
		container.add(this.pickerTranscript);
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
		if ((this.picker ? this.picker.state !== "ready" : this.busy) || text.length === 0) {
			return;
		}
		if (isPicker(this.screen)) {
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
		void this.dispatch(async () => await conversation.deliver(text));
	}

	private copyAuthUrl(): boolean {
		const screen = this.screen;
		if (screen.kind !== "login" || screen.url === null || this.input.value.length > 0) {
			return false;
		}
		void copyToClipboard(screen.url).then(
			() => this.appendPickerLine("Link copied.", T3),
			() => this.appendPickerLine("Could not copy the link.", ERROR_COLOR),
		);
		return true;
	}

	private handleEscape() {
		if (isPicker(this.screen)) {
			this.lastEscapeAt = null;
			this.cancelSelection();
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
			const home = this.homeScreen();
			if (home.kind === "bots") {
				this.appendLine("Open a bot to choose its model.", T3);
				return true;
			}
			void this.showModels(home.bot);
			return true;
		}
		if (text === "/effort") {
			this.input.value = "";
			this.showCurrentEfforts();
			return true;
		}
		if (text === "/login") {
			this.input.value = "";
			this.showProviders();
			return true;
		}
		if (text === "/logout") {
			this.input.value = "";
			void this.showAccounts();
			return true;
		}
		return false;
	}

	private cancelSelection() {
		if (this.screen.kind === "login") {
			this.screen.session.cancel();
		}
		if (isPicker(this.screen)) {
			this.closePicker();
		}
	}

	private selectOption(text: string) {
		const screen = this.screen;
		this.input.value = "";
		if (screen.kind === "login") {
			this.answerLogin(screen, text);
			return;
		}
		if (!/^[1-9]\d*$/.test(text)) {
			this.appendPickerLine("Choose a number, or /cancel to return.", T3);
			return;
		}
		const index = Number(text) - 1;
		if (screen.kind === "accounts") {
			const email = screen.emails[index];
			if (email) {
				void this.removeAccount(email);
				return;
			}
		}
		if (screen.kind === "providers") {
			const target = LOGIN_TARGETS[index];
			if (target) {
				this.startLogin(target);
				return;
			}
		}
		if (screen.kind === "catalog") {
			const provider = ProviderSchema.options[index];
			if (provider) {
				this.showProviderModels(screen.bot, provider, screen.catalog);
				return;
			}
		}
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
		this.appendPickerLine("Choose one of the listed numbers.", T3);
	}

	private async showModels(bot: BotInfo) {
		if (!this.conversation) {
			return;
		}
		const signal = this.openPicker({ kind: "catalog", bot, catalog: { models: [], errors: [] } }, `${bot.name}  ·  model`);
		try {
			const catalog = await listModels();
			if (signal.aborted) {
				return;
			}
			this.screen = { kind: "catalog", bot, catalog };
			for (const [index, provider] of ProviderSchema.options.entries()) {
				const count = catalog.models.filter((option) => option.provider === provider).length;
				this.appendPickerLine(`${index + 1}. ${PROVIDER_NAMES[provider]} · ${count} models`, T2, 0);
			}
			for (const error of catalog.errors) {
				this.appendPickerLine(`${PROVIDER_NAMES[error.provider]}: ${error.message}`, T3);
			}
			this.appendPickerLine("/cancel to return or press Esc", T4);
			this.setPickerStatus("ready");
		} catch (error) {
			if (!signal.aborted) {
				this.appendPickerLine(describeError(error), ERROR_COLOR);
				this.setPickerStatus("ready");
			}
		}
	}

	private showProviderModels(bot: BotInfo, provider: Provider, catalog: ModelCatalog) {
		const options = catalog.models.filter((option) => option.provider === provider);
		this.openPicker({ kind: "models", bot, options }, `${PROVIDER_NAMES[provider]}  ·  model`);
		if (options.length === 0) {
			const failure = catalog.errors.find((error) => error.provider === provider);
			this.appendPickerLine(failure?.message ?? "No model is available for this provider.", T3, 0);
		}
		for (const [index, option] of options.entries()) {
			this.appendPickerLine(`${index + 1}. ${option.name}`, T2, 0);
		}
		this.appendPickerLine("/cancel to return or press Esc", T4);
		this.pickerTranscript.scrollTo(0);
		this.setPickerStatus("ready");
	}

	private showCurrentEfforts() {
		const home = this.homeScreen();
		if (home.kind === "bots") {
			this.appendLine("Open a bot to choose its effort.", T3);
			return;
		}
		try {
			this.showEfforts(home.bot, modelOption(home.bot.model));
		} catch (error) {
			this.appendLine(describeError(error), ERROR_COLOR);
		}
	}

	private showEfforts(bot: BotInfo, option: ModelOption) {
		if (option.reasoningOptions.length === 1) {
			void this.saveModel(bot, { provider: option.provider, id: option.id, reasoning: option.reasoningOptions[0] });
			return;
		}
		this.openPicker({ kind: "effort", bot, option }, `${option.name}  ·  effort`);
		for (const [index, effort] of option.reasoningOptions.entries()) {
			this.appendPickerLine(`${index + 1}. ${effort}`, T2, 0);
		}
		this.appendPickerLine("/cancel to return or press Esc", T4);
		this.setPickerStatus("ready");
	}

	private showProviders() {
		this.openPicker({ kind: "providers" }, "login");
		let group: LoginGroup | null = null;
		for (const [index, target] of LOGIN_TARGETS.entries()) {
			if (target.group !== group) {
				if (group !== null) {
					this.appendPickerLine("", T4, 0);
				}
				group = target.group;
				this.appendPickerLine(LOGIN_GROUP_NAMES[group], T4, 0);
			}
			this.appendPickerLine(`${index + 1}. ${target.name} · ${target.how}`, T2, 0);
		}
		this.appendPickerLine("/cancel to return or press Esc", T4);
		this.setPickerStatus("ready");
	}

	private async showAccounts() {
		const signal = this.openPicker({ kind: "accounts", emails: [] }, "logout");
		try {
			const accounts = await listAccounts();
			if (signal.aborted) {
				return;
			}
			this.screen = { kind: "accounts", emails: accounts.map((account) => account.email) };
			if (accounts.length === 0) {
				this.appendPickerLine("No Gmail account is connected.", T3, 0);
			}
			for (const [index, account] of accounts.entries()) {
				this.appendPickerLine(`${index + 1}. ${account.email}`, T2, 0);
			}
			this.appendPickerLine("/cancel to return or press Esc", T4);
			this.setPickerStatus("ready");
		} catch (error) {
			if (!signal.aborted) {
				this.appendPickerLine(describeError(error), ERROR_COLOR);
				this.setPickerStatus("ready");
			}
		}
	}

	private async removeAccount(email: string) {
		const picker = this.screen;
		const signal = this.picker?.view.signal;
		this.screen = { kind: "saving" };
		this.setPickerStatus("loading");
		try {
			const result = await disconnectAccount(email);
			if (signal?.aborted) {
				return;
			}
			this.closePicker();
			const revoke = result.revoked ? "" : " Google did not confirm the revoke.";
			this.appendLine(`Disconnected ${result.email}.${revoke}`, T3);
		} catch (error) {
			if (!signal?.aborted) {
				this.screen = picker;
				this.appendPickerLine(describeError(error), ERROR_COLOR);
				this.setPickerStatus("ready");
			}
		}
	}

	private startLogin(target: (typeof LOGIN_TARGETS)[number]) {
		this.showLogin(target.id, new LoginSession(target.id));
	}

	private showLogin(target: LoginTarget, session: LoginSession) {
		const screen: PickerScreen = { kind: "login", target, session, url: null, prompt: null };
		const name = LOGIN_TARGETS.find((option) => option.id === target)?.name ?? target;
		const signal = this.openPicker(screen, `${name}  ·  login`);
		this.input.placeholder = "waiting";
		session.subscribe((event) => {
			if (!signal.aborted) {
				this.renderLoginEvent(screen, event);
			}
		});
	}

	private renderLoginEvent(screen: Extract<PickerScreen, { kind: "login" }>, event: LoginEvent) {
		if (event.type === "info") {
			this.appendPickerLine(event.text, T3);
			return;
		}
		if (event.type === "url") {
			screen.url = event.url;
			this.appendPickerLine(event.url, T1, 0);
			if (event.instructions) {
				this.appendPickerLine(event.instructions, T4);
			}
			this.appendPickerLine("Press c to copy the link.", T4);
			return;
		}
		if (event.type === "prompt") {
			screen.prompt = event.prompt;
			this.appendPickerLine(event.prompt.message, T2, 0);
			for (const [index, option] of event.prompt.options.entries()) {
				this.appendPickerLine(`${index + 1}. ${option.label}`, T2, 0);
			}
			this.appendPickerLine("/cancel to return or press Esc", T4);
			this.input.placeholder = event.prompt.kind === "select" ? "number or /cancel" : "type here or /cancel";
			this.setPickerStatus("ready");
			return;
		}
		if (event.type === "failed") {
			this.appendPickerLine(event.message, ERROR_COLOR);
			this.setPickerStatus("ready");
			return;
		}
		this.closePicker();
		const next = screen.target === "gmail" ? "The bots can use this account now." : "Use /model to pick a model.";
		this.appendLine(`Connected. ${next}`, T3);
	}

	private answerLogin(screen: Extract<PickerScreen, { kind: "login" }>, text: string) {
		if (!screen.prompt) {
			return;
		}
		screen.prompt = null;
		this.input.placeholder = "waiting";
		this.setPickerStatus("loading");
		screen.session.answer(text);
	}

	private async saveModel(bot: BotInfo, selection: ModelSelection) {
		const picker = this.screen;
		if (picker.kind !== "models" && picker.kind !== "effort") {
			return;
		}
		const signal = this.picker?.view.signal;
		this.screen = { kind: "saving" };
		this.setPickerStatus("loading");
		try {
			const updated = await this.requireConversation().selectModel(selection);
			if (signal?.aborted) {
				return;
			}
			this.closePicker({ kind: "conversation", bot: updated });
			this.appendLine("Model saved for the next response.", T3);
		} catch (error) {
			if (!signal?.aborted) {
				this.screen = picker;
				this.appendPickerLine(describeError(error), ERROR_COLOR);
				this.setPickerStatus("ready");
			}
		}
	}

	private requireConversation(): Bot {
		if (!this.conversation) {
			throw new Error("Open a bot first.");
		}
		return this.conversation;
	}

	private clearPicker() {
		for (const child of this.pickerTranscript.getChildren()) {
			child.destroyRecursively();
		}
	}

	private appendPickerLine(content: string, fg = T2, marginBottom = 1) {
		this.pickerTranscript.add(new TextRenderable(this.renderer, { content, fg, width: "100%", wrapMode: "word", marginBottom }));
	}

	private setPickerStatus(state: string) {
		if (this.picker) {
			this.picker.state = state;
		}
		this.setStatus(this.lastState);
	}

	private closePicker(back?: HomeScreen) {
		const draft = this.picker?.draft ?? "";
		const screen = back ?? this.picker?.back ?? { kind: "bots", bots: [] };
		this.picker?.view.abort();
		this.picker = null;
		this.clearPicker();
		this.pickerTranscript.visible = false;
		this.transcript.visible = true;
		this.screen = screen;
		if (screen.kind === "conversation") {
			this.modelInfo = screen.bot.model;
			this.heading.content = `${screen.bot.name}  ·  /bots  /model  /effort`;
			this.input.placeholder = "write your prompt";
		} else {
			this.heading.content = "bots";
			this.input.placeholder = "number or /new <name>";
		}
		this.input.value = draft;
		this.setStatus(this.lastState);
	}

	private openPicker(screen: PickerScreen, heading: string) {
		const back = this.picker?.back ?? this.homeScreen();
		this.picker?.view.abort();
		this.picker = { view: new AbortController(), draft: this.picker?.draft ?? this.input.value, state: "loading", back };
		this.screen = screen;
		this.clearPicker();
		this.transcript.visible = false;
		this.pickerTranscript.visible = true;
		this.input.value = "";
		this.heading.content = heading;
		this.input.placeholder = "number or /cancel";
		this.setStatus(this.lastState);
		return this.picker.view.signal;
	}

	private homeScreen(): HomeScreen {
		const screen = this.screen;
		if (screen.kind === "conversation" || screen.kind === "bots") {
			return screen;
		}
		return { kind: "bots", bots: [] };
	}

	private resetView(screen: HomeScreen) {
		if (this.screen.kind === "login") {
			this.screen.session.cancel();
		}
		this.picker?.view.abort();
		this.picker = null;
		this.clearPicker();
		this.pickerTranscript.visible = false;
		this.transcript.visible = true;
		this.screen = screen;
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
		this.heading.content = "bots";
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
		this.heading.content = `${bot.name}  ·  /bots  /model  /effort`;
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
				this.appendLine(`you: ${event.text}`, USER_COLOR);
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
				this.appendLine(`✗ tool failed: ${event.message}`, ERROR_COLOR);
				return;
			case "approval":
				this.renderApproval(event.approval);
				return;
			case "login":
				this.showLogin(event.target, event.session);
				return;
			case "approval-resolved":
				this.approval = null;
				this.appendLine(`⏸ ${event.outcome}`, TOOL_COLOR);
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
				this.setStatus(this.lastState);
				return;
			case "turn-started":
				this.lastEscapeAt = null;
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
			this.appendLine(`✗ error: ${message}${hint}`, ERROR_COLOR);
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
		this.appendLine(`⚙ ${toolName}`, TOOL_COLOR, this.details ? 0 : 1);
		this.appendDetail(JSON.stringify(input), 0);
	}

	private appendDetail(text: string | undefined, marginBottom = 1): void {
		const detail = text?.trim();
		if (!this.details || !detail || detail === "{}") {
			return;
		}
		this.appendLine(`   ${truncate(detail, DETAIL_CHARACTERS)}`, T4, marginBottom);
	}

	private toggleDetails(): void {
		const screen = this.screen;
		if (screen.kind !== "conversation" || !this.conversation) {
			return;
		}
		this.details = !this.details;
		void this.openBot(screen.bot);
	}

	private renderApproval(approval: Approval): void {
		this.approval = approval;
		this.appendLine(`▌ ⏸ approval: ${approval.toolName}`, ATTENTION_COLOR);
		const input = JSON.stringify(approval.input);
		if (input !== "{}") {
			this.appendLine(`   ${truncate(input, APPROVAL_INPUT_CHARACTERS)}`, TOOL_COLOR);
		}
		this.appendLine("   1. Approve   2. Cancel", TEXT_COLOR);
		this.busy = false;
		this.setStatus("waiting");
	}

	private appendReplyDelta(delta: string): void {
		const block = this.ensureReply();
		this.replyText += delta;
		block.content = this.replyText;
	}

	private completeReply(message: string): void {
		if (message !== "") {
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
		parts.push(`model: ${model} (${modelInfo?.reasoning ?? "default"})`);
		parts.push(`mode: ${label}`, `status: ${this.picker?.state ?? state}`);
		this.status.content = parts.join(" | ");
	}
}

function describeError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
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
