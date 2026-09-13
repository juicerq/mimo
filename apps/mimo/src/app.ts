import { BoxRenderable, InputRenderable, InputRenderableEvents, RenderableEvents, type CliRenderer } from "@opentui/core";
import { activity, Bot, deleteBot, type BotActivity } from "@agent/bot/bot";
import { createBot, listBots } from "@agent/bot/store";
import { BotNameSchema, type BotEvent, type BotInfo, type ToolGroup } from "@agent/bot/types";
import { modelOption } from "@agent/model/catalog";
import type { ModelSelection } from "@agent/model/types";
import { Bar, NEXT_TEAM_VIEW, type TeamView } from "./bar";
import { describeError } from "./errors";
import { Footer } from "./footer";
import { Panels, type Panel, type PanelResult } from "./panel";
import { Rail } from "./rail";
import { Screen } from "./screen";
import { deletePanel } from "./panels/delete";
import { accountsPanel, loginTargetsPanel } from "./panels/login";
import { effortPanel, modelPanel } from "./panels/model";
import { toolsPanel } from "./panels/tools";
import { Transcript } from "./transcript";
import { Turn } from "./turn";
import { View } from "./view";
import { T1, T2, T3, T4, T5 } from "./theme";

const DOUBLE_ESCAPE_MS = 400;

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
	private readonly transcript: Transcript;
	private readonly footer: Footer;
	private readonly input: InputRenderable;
	private readonly panels: Panels;
	private readonly bar: Bar;
	private readonly rail: Rail;
	private readonly view: View;
	private readonly screen = new Screen();
	private readonly turn = new Turn(() => {
		this.spin();
	});
	private lastEscapeAt: number | null = null;
	private teamView: TeamView = "bar";

	constructor(renderer: CliRenderer) {
		this.transcript = new Transcript(renderer);
		this.footer = new Footer(renderer);
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
			if (key.ctrl && key.name === "p" && this.screen.conversation) {
				this.showModels();
			} else if (key.ctrl && key.name === "t") {
				this.cycleTeamView();
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

		this.bar = new Bar(renderer);
		this.rail = new Rail(renderer);
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
		row.add(container);
		row.add(this.rail.box);
		renderer.root.add(row);
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
		if (this.turn.busy && this.screen.listing) {
			return;
		}
		if (/^\/new(?: |$)/.test(text)) {
			void this.createBot(text.slice(4).trim());
			return;
		}
		if (this.screen.listing) {
			const bot = this.screen.bots[Number(text) - 1];
			if (bot && /^[1-9]\d*$/.test(text)) {
				void this.openBot(bot);
			} else {
				this.transcript.note("Choose a bot by number, or type /new <name>.", T3);
			}
			return;
		}
		const conversation = this.screen.conversation;
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
		this.input.value = "";
		command();
		return true;
	}

	private showBotPanel(hint: string, build: (info: BotInfo) => Panel): void {
		const conversation = this.screen.conversation;
		if (!conversation) {
			this.transcript.note(hint, T3);
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

	private readonly saveModel = async (selection: ModelSelection): Promise<BotInfo> => {
		return await this.screen.require().selectModel(selection);
	};

	private readonly removeBot = async (bot: BotInfo): Promise<void> => {
		await deleteBot(bot.id);
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
		}
		this.input.placeholder = this.screen.placeholder;
		if (result.message) {
			this.transcript.note(result.message, T3);
		}
		this.refreshPanels();
	};

	private resetView(bot: BotInfo | null) {
		this.panels.dismiss();
		this.transcript.box.visible = true;
		const signal = this.screen.show(bot);
		this.transcript.clear(bot?.name ?? "");
		this.input.value = "";
		this.input.placeholder = this.screen.placeholder;
		this.footer.reset(bot);
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
			this.transcript.note(bots.length ? "/new <name> to create a bot, /delete to remove one" : "Create your first bot with /new <name>.", T4);
			if (note) {
				this.transcript.note(note, T3);
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
			this.transcript.note("Use /new <name> with 1–80 visible characters.", T3);
			return;
		}
		const signal = this.screen.signal;
		this.turn.enter("loading");
		try {
			const bot = await createBot({ name: parsed.data });
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
		const input = this.input.value;
		this.input.value = "";
		this.view.forget();
		if (this.turn.idle) {
			this.turn.start();
		}
		try {
			await operation();
		} catch (error) {
			if (!signal.aborted) {
				if (!this.input.value) {
					this.input.value = input;
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
		this.footer.detail(this.transcript.cycle());
		void this.openBot(conversation.info);
	}

	private spin(): void {
		this.transcript.working(this.panels.active ? undefined : this.turn.label);
	}
}
