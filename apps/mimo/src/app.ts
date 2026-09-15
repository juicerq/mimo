import { BoxRenderable, CliRenderEvents, RenderableEvents, TextareaRenderable, type CliRenderer, type KeyEvent } from "@opentui/core";
import { Bot } from "@agent/bot/bot";
import { activity, deleteBot, type BotActivity } from "@agent/bot/registry";
import { createBot, listBots } from "@agent/bot/store";
import { BotNameSchema, type BotEvent, type BotInfo, type ToolGroup } from "@agent/bot/types";
import { modelOption } from "@agent/model/catalog";
import type { ModelSelection } from "@agent/model/types";
import { Bar, NEXT_TEAM_VIEW, type TeamView } from "./bar";
import { copyToClipboard, pasteText, readClipboardImage } from "./clipboard";
import { describeError } from "./errors";
import { Footer } from "./footer";
import { Panels, type Panel, type PanelResult } from "./panel";
import { Rail } from "./rail";
import { Screen } from "./screen";
import { Sidebar } from "./sidebar";
import { deletePanel } from "./panels/delete";
import { folderPanel } from "./panels/folder";
import { accountsPanel, loginTargetsPanel } from "./panels/login";
import { effortPanel, modelPanel } from "./panels/model";
import { toolsPanel } from "./panels/tools";
import { Transcript } from "./transcript";
import { Turn } from "./turn";
import { View } from "./view";
import { T1, T2, T4, T6, T7, T8 } from "./theme";

const DOUBLE_ESCAPE_MS = 400;
const COMPOSER_MAX_LINES = 6;

function listMark(entry: BotActivity | undefined): string {
	if (entry?.failed) {
		return " ✗ error";
	}
	if (entry?.waiting) {
		return ` ⏸ approval: ${entry.waiting}`;
	}
	return "";
}

export class MimoApp {
	private readonly renderer: CliRenderer;
	private readonly transcript: Transcript;
	private readonly footer: Footer;
	private readonly input: TextareaRenderable;
	private readonly panels: Panels;
	private readonly bar: Bar;
	private readonly rail: Rail;
	private readonly sidebar: Sidebar;
	private readonly view: View;
	private readonly screen = new Screen();
	private readonly turn = new Turn(() => {
		this.spin();
	});
	private lastEscapeAt: number | null = null;
	private teamView: TeamView = "bar";
	private composerDrafts = new Map<string, { text: string; cursor: number }>();

	constructor(renderer: CliRenderer) {
		this.renderer = renderer;
		this.transcript = new Transcript(renderer);
		this.footer = new Footer(renderer);
		this.input = new TextareaRenderable(renderer, {
			id: "composer",
			width: "100%",
			height: 1,
			maxHeight: COMPOSER_MAX_LINES,
			placeholder: "write your prompt",
			textColor: T2,
			cursorColor: T1,
			cursorStyle: { style: "line", blinking: true },
			wrapMode: "word",
			keyBindings: [
				{ name: "return", action: "submit" },
				{ name: "kpenter", action: "submit" },
				{ name: "linefeed", action: "submit" },
				{ name: "return", shift: true, action: "newline" },
				{ name: "kpenter", shift: true, action: "newline" },
				{ name: "linefeed", shift: true, action: "newline" },
			],
			onSubmit: () => {
				this.submit(this.input.plainText);
			},
		});
		this.input.onContentChange = () => {
			this.fitComposer();
		};
		this.input.onPaste = (event) => {
			this.paste(event.bytes);
		};
		renderer.on(CliRenderEvents.RESIZE, () => {
			this.fitComposer();
		});
		renderer.on(CliRenderEvents.SELECTION, (selection) => {
			this.copySelection(selection.getSelectedText());
		});
		this.panels = new Panels(renderer, { input: this.input, refresh: this.refreshPanels, finish: this.closePanel, syncComposer: () => {
			this.fitComposer();
		} });
		renderer.keyInput.on("keypress", (key) => {
			this.handleKey(key);
		});

		const composer = new BoxRenderable(renderer, {
			id: "composer-box",
			width: "100%",
			flexShrink: 0,
			border: true,
			borderStyle: "rounded",
			borderColor: T8,
			paddingLeft: 1,
			paddingRight: 1,
		});
		this.input.on(RenderableEvents.FOCUSED, () => {
			composer.borderColor = T7;
		});
		this.input.on(RenderableEvents.BLURRED, () => {
			composer.borderColor = T8;
		});
		composer.add(this.input);

		this.bar = new Bar(renderer);
		this.rail = new Rail(renderer);
		this.sidebar = new Sidebar(renderer, (bot) => {
			void this.openBot(bot);
		});
		this.view = new View({
			transcript: this.transcript,
			footer: this.footer,
			bar: this.bar,
			turn: this.turn,
			showPanel: (panel) => {
				this.panels.show(panel);
			},
			botName: () => this.screen.bot?.name,
		});

		const container = new BoxRenderable(renderer, {
			id: "app-column",
			flexGrow: 1,
			minWidth: 0,
			height: "100%",
			flexDirection: "column",
		});
		container.add(this.panels.row);
		container.add(this.transcript.box);
		container.add(this.panels.box);
		container.add(this.bar.box);
		container.add(composer);
		container.add(this.footer.box);
		const row = new BoxRenderable(renderer, {
			id: "app",
			width: "100%",
			height: "100%",
			flexDirection: "row",
		});
		row.add(this.sidebar.box);
		row.add(container);
		row.add(this.rail.box);
		renderer.root.add(row);
	}

	async start(): Promise<void> {
		this.input.focus();
		this.sidebar.start();
		const draft = this.input.plainText;
		const loading = this.showBots();
		this.input.setText(draft);
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
		if (this.turn.busy && this.screen.listing) {
			return;
		}
		if (/^\/new(?: |$)/.test(text)) {
			if (text.slice(4).trim() !== "") {
				this.clearComposerDraft(this.screen.conversation?.info.id);
				this.clearComposer();
			}
			void this.createBot(text.slice(4).trim());
			return;
		}
		if (this.screen.listing) {
			const bot = this.screen.bots[Number(text) - 1];
			if (bot && /^[1-9]\d*$/.test(text)) {
				void this.openBot(bot);
			} else {
				this.transcript.note("Choose a bot by number, or type /new <name>.", T4);
			}
			return;
		}
		const conversation = this.screen.conversation;
		if (!conversation) {
			return;
		}
		this.clearComposerDraft(conversation.info.id);
		void this.dispatch(async () => await conversation.deliver(text));
	}

	private handleKey(key: KeyEvent): void {
		if (key.ctrl && this.controlKey(key.name)) {
			return;
		}
		if (this.sidebar.active) {
			if (this.sidebarKey(key.name) || !this.sidebar.typing) {
				key.preventDefault();
				return;
			}
		}
		if (key.name === "c" && !key.ctrl && !key.meta && this.input.plainText.length === 0 && this.panels.copyLink()) {
			key.preventDefault();
			this.lastEscapeAt = null;
			return;
		}
		if (key.name === "escape") {
			this.handleEscape();
			return;
		}
		this.lastEscapeAt = null;
	}

	private controlKey(name: string | undefined): boolean {
		if (name === "e") {
			this.toggleSidebar();
			return true;
		}
		if (name === "p" && this.screen.conversation) {
			this.showModels();
			return true;
		}
		if (name === "t") {
			this.cycleTeamView();
			return true;
		}
		if (name === "o") {
			this.cycleDetail();
			return true;
		}
		return false;
	}

	private toggleSidebar(): void {
		if (this.sidebar.active) {
			this.sidebar.blur();
			this.input.focus();
			return;
		}
		this.sidebar.focus();
	}

	private leaveSidebar(): void {
		this.sidebar.choose();
		this.sidebar.blur();
		this.input.focus();
	}

	private sidebarKey(name: string | undefined): boolean {
		if (name === "up") {
			this.sidebar.move(-1);
			return true;
		}
		if (name === "down") {
			this.sidebar.move(1);
			return true;
		}
		if (name === "return" || name === "enter") {
			this.leaveSidebar();
			return true;
		}
		if (name === "escape") {
			if (this.sidebar.escapeFilter()) {
				return true;
			}
			this.toggleSidebar();
			return true;
		}
		return false;
	}

	private handleEscape() {
		if (this.panels.active) {
			this.lastEscapeAt = null;
			this.panels.cancel();
			return;
		}
		if (this.screen.listing || this.turn.idle || this.turn.state === "cancelling") {
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
		this.turn.enter("cancelling");
		this.screen.conversation?.cancel();
	}

	private readonly showModels = (): void => {
		this.showBotPanel("Open a bot to choose its model.", (info) => modelPanel(info, this.saveModel));
	};

	private get commands(): Map<string, () => void> {
		return new Map<string, () => void>([
			["/bots", () => {
				void this.showBots();
			}],
			["/cancel", this.panels.cancel],
			["/model", this.showModels],
			["/tools", () => {
				this.showBotPanel("Open a bot to choose its tools.", (info) => toolsPanel(info, this.saveTools));
			}],
			["/folder", () => {
				this.showBotPanel("Open a bot to choose its folder.", (info) => folderPanel(info, this.saveFolder));
			}],
			["/effort", () => {
				this.showBotPanel("Open a bot to choose its effort.", (info) => effortPanel(modelOption(info.model), this.saveModel));
			}],
			["/delete", () => {
				this.panels.show(deletePanel(this.removeBot));
			}],
			["/login", () => {
				this.panels.show(loginTargetsPanel());
			}],
			["/logout", () => {
				this.panels.show(accountsPanel());
			}],
		]);
	}

	private navigate(text: string): boolean {
		if (this.panels.state === "saving") {
			return true;
		}
		const command = this.commands.get(text);
		if (!command) {
			return false;
		}
		this.clearComposer();
		command();
		return true;
	}

	private showBotPanel(hint: string, build: (info: BotInfo) => Panel): void {
		const conversation = this.screen.conversation;
		if (!conversation) {
			this.transcript.note(hint, T4);
			return;
		}
		try {
			this.panels.show(build(conversation.info));
		} catch (error) {
			this.transcript.note(describeError(error), T1);
		}
	}

	private readonly saveTools = async (tools: ToolGroup[]): Promise<BotInfo> => {
		return await this.screen.require().setTools(tools);
	};

	private readonly saveFolder = async (folder: string | undefined): Promise<BotInfo> => {
		return await this.screen.require().setFolder(folder);
	};

	private readonly saveModel = async (selection: ModelSelection): Promise<BotInfo> => {
		return await this.screen.require().selectModel(selection);
	};

	private readonly removeBot = async (bot: BotInfo): Promise<void> => {
		this.clearComposerDraft(bot.id);
		await deleteBot(bot.id, "panel");
		await this.sidebar.reload();
	};

	private readonly refreshPanels = (): void => {
		this.transcript.box.visible = !this.panels.active;
		this.footer.panel(this.panels.active ? this.panels.state : undefined);
		this.spin();
	};

	private readonly closePanel = (result: PanelResult): void => {
		if (result.list) {
			void this.showBots(result.message);
			return;
		}
		if (result.bot) {
			this.footer.model(result.bot.model);
			this.footer.folder(result.bot.folder);
		}
		this.input.placeholder = this.screen.placeholder;
		if (result.message) {
			this.transcript.note(result.message, T4);
		}
		this.refreshPanels();
	};

	private resetView(bot: BotInfo | null) {
		this.stashComposerDraft();
		this.panels.dismiss();
		this.transcript.box.visible = true;
		const signal = this.screen.show(bot);
		this.transcript.clear(bot?.name ?? "");
		this.restoreComposerDraft(bot?.id ?? null);
		this.input.placeholder = this.screen.placeholder;
		this.footer.reset(bot);
		this.sidebar.show(bot);
		this.view.forget();
		this.lastEscapeAt = null;
		this.bar.stop();
		this.turn.enter("loading");
		return signal;
	}

	private async showBots(note?: string) {
		const signal = this.resetView(null);
		try {
			const bots = await listBots();
			if (signal.aborted) {
				return;
			}
			this.screen.list(bots);
			const open = new Map(activity().map((entry) => [entry.id, entry]));
			for (const [index, bot] of bots.entries()) {
				const entry = open.get(bot.id);
				this.transcript.note(`${index + 1}. ${bot.name}${listMark(entry)}`, T2);
			}
			this.transcript.note(bots.length ? "/new <name> to create a bot, /delete to remove one" : "Create your first bot with /new <name>.", T6);
			if (note) {
				this.transcript.note(note, T4);
			}
			this.turn.enter("ready");
		} catch (error) {
			if (!signal.aborted) {
				this.view.failure(describeError(error));
			}
		}
	}

	private async createBot(name: string) {
		const parsed = BotNameSchema.safeParse(name);
		if (!parsed.success) {
			this.transcript.note("Use /new <name> with 1–80 visible characters.", T4);
			return;
		}
		const signal = this.screen.signal;
		this.turn.enter("loading");
		try {
			const bot = await createBot({ name: parsed.data });
			await this.sidebar.reload();
			if (!signal.aborted) {
				await this.openBot(bot);
			}
		} catch (error) {
			if (!signal.aborted) {
				this.view.failure(describeError(error));
			}
		}
	}

	private async openBot(bot: BotInfo) {
		const signal = this.resetView(bot);
		try {
			const conversation = await Bot.open(bot.id);
			if (signal.aborted) {
				return;
			}
			this.footer.reset(conversation.info);
			this.turn.enter("ready");
			for (const event of conversation.transcript()) {
				this.showEvent(event);
			}
			this.bar.queue(conversation.queue);
			this.bar.watch({ read: activity, botId: conversation.info.id });
			this.transcript.toBottom();
			this.screen.connect(conversation, this.showEvent);
			const approval = conversation.approval;
			if (approval) {
				this.showEvent({ type: "approval", approval });
			}
			const failure = conversation.failed;
			if (failure) {
				this.showEvent({ type: "turn-failed", message: failure });
			}
		} catch (error) {
			if (!signal.aborted) {
				this.view.failure(describeError(error));
			}
		}
	}

	private async dispatch(operation: () => Promise<void>): Promise<void> {
		const signal = this.screen.signal;
		const input = this.input.plainText;
		this.clearComposer();
		this.view.forget();
		if (this.turn.idle) {
			this.turn.start();
		}
		try {
			await operation();
		} catch (error) {
			if (!signal.aborted) {
				if (!this.input.plainText) {
					this.input.setText(input);
					this.fitComposer();
				}
				this.view.failure(describeError(error));
			}
		}
	}

	private readonly showEvent = (event: BotEvent): void => {
		if (event.type === "turn-started") {
			this.lastEscapeAt = null;
		}
		this.view.show(event);
	};

	private cycleTeamView(): void {
		this.teamView = NEXT_TEAM_VIEW[this.teamView];
		this.bar.view(this.teamView);
		this.showRail();
		this.footer.team(this.teamView);
	}

	private showRail(): void {
		if (this.teamView === "rail") {
			this.rail.show();
			return;
		}
		this.rail.hide();
	}

	private cycleDetail(): void {
		const conversation = this.screen.conversation;
		if (!conversation) {
			return;
		}
		const state = this.turn.state;
		const worked = this.turn.label === "working";
		this.footer.detail(this.transcript.cycle());
		void this.refreshDetail(conversation.info, state, worked);
	}

	private async refreshDetail(info: BotInfo, state: string, worked: boolean): Promise<void> {
		await this.openBot(info);
		const conversation = this.screen.conversation;
		if (!conversation || conversation.info.id !== info.id || !conversation.busy) {
			return;
		}
		if (state === "cancelling") {
			this.turn.enter("cancelling");
			return;
		}
		this.turn.start();
		if (worked) {
			this.turn.ranTool();
		}
	}

	private clearComposerDraft(id: string | undefined): void {
		if (id) {
			this.composerDrafts.delete(id);
		}
	}

	private stashComposerDraft(): void {
		const id = this.screen.conversation?.info.id;
		if (!id) {
			return;
		}
		const text = this.panels.active ? this.panels.composerDraft : this.input.plainText;
		if (text) {
			this.composerDrafts.set(id, { text, cursor: this.input.cursorOffset });
		} else {
			this.composerDrafts.delete(id);
		}
	}

	private restoreComposerDraft(id: string | null): void {
		const draft = id ? this.composerDrafts.get(id) : undefined;
		this.input.setText(draft?.text ?? "");
		this.input.cursorOffset = draft ? Math.min(draft.cursor, this.input.plainText.length) : 0;
		this.fitComposer();
	}

	private clearComposer(): void {
		this.input.setText("");
		this.fitComposer();
	}

	private fitComposer(): void {
		const lines = Math.max(1, this.input.lineCount || 1, this.input.editorView.getTotalVirtualLineCount() || 1);
		const height = Math.min(COMPOSER_MAX_LINES, lines);
		if (this.input.height !== height) {
			this.input.height = height;
		}
	}

	private paste(bytes: Uint8Array): void {
		const text = pasteText(bytes);
		if (text.length > 0) {
			return;
		}
		void readClipboardImage(this.renderer).then((image) => {
			if (!image) {
				return;
			}
			this.transcript.note(`🖼 pasted image ${image.mimeType} ${image.bytes.length} bytes`, T2);
		}, (error: unknown) => {
			this.transcript.note(describeError(error), T1);
		});
	}

	private copySelection(text: string): void {
		if (text.trim() === "") {
			return;
		}
		void copyToClipboard(text).then(() => {
			this.footer.copied();
		}, (error: unknown) => {
			this.transcript.note(describeError(error), T1);
		});
	}

	private spin(): void {
		this.transcript.working(this.panels.active ? undefined : this.turn.label);
	}
}
