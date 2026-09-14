import { BoxRenderable, CliRenderEvents, InputRenderable, InputRenderableEvents, TextRenderable, type CliRenderer } from "@opentui/core";
import { activity, type BotActivity } from "@agent/bot/registry";
import { listBots } from "@agent/bot/store";
import type { BotInfo } from "@agent/bot/types";
import { Lines, type Line } from "./lines";
import { cut } from "./text";
import { T1, T2, T3, T4, T5 } from "./theme";

const TICK_MS = 1000;
const WIDE_COLS = 24;
const NARROW_COLS = 3;
const NARROW_TERMINAL = 90;

interface Entry {
	bot: BotInfo;
	mark: string;
	fronts: number;
}

function mark(live: BotActivity | undefined): string {
	if (!live) {
		return " ";
	}
	if (live.failed !== null) {
		return "✗";
	}
	if (live.waiting !== null) {
		return "⏸";
	}
	if (live.busy || live.team.length > 0) {
		return "●";
	}
	return " ";
}

function entries(bots: readonly BotInfo[]): Entry[] {
	const live = new Map(activity().map((entry) => [entry.id, entry]));
	return bots.map((bot) => ({ bot, mark: mark(live.get(bot.id)), fronts: live.get(bot.id)?.team.length ?? 0 }));
}

export class Sidebar {
	readonly box: BoxRenderable;
	private readonly search: InputRenderable;
	private readonly lines: Lines;
	private readonly hint: TextRenderable;
	private readonly title: TextRenderable;
	private readonly renderer: CliRenderer;
	private readonly open: (bot: BotInfo) => void;
	private bots: readonly BotInfo[] = [];
	private rows: Entry[] = [];
	private cursor = 0;
	private focused = false;
	private searching = false;
	private current: string | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(renderer: CliRenderer, open: (bot: BotInfo) => void) {
		this.renderer = renderer;
		this.open = open;
		this.box = new BoxRenderable(renderer, {
			id: "sidebar",
			width: WIDE_COLS,
			height: "100%",
			flexShrink: 0,
			flexDirection: "column",
			border: ["right"],
			borderColor: T5,
			paddingLeft: 1,
			paddingRight: 1,
		});
		this.title = new TextRenderable(renderer, { id: "sidebar-title", content: "bots", fg: T3, width: "100%", flexShrink: 0 });
		this.box.add(this.title);
		this.search = new InputRenderable(renderer, {
			id: "sidebar-search",
			width: "100%",
			placeholder: "filtrar",
			textColor: T2,
			cursorColor: T1,
			visible: false,
			flexShrink: 0,
		});
		this.search.on(InputRenderableEvents.INPUT, () => {
			this.cursor = 0;
			this.draw();
		});
		this.box.add(this.search);
		const list = new BoxRenderable(renderer, {
			id: "sidebar-list",
			width: "100%",
			flexGrow: 1,
			minHeight: 0,
			flexDirection: "column",
			paddingTop: 1,
		});
		this.box.add(list);
		this.lines = new Lines(renderer, list);
		this.hint = new TextRenderable(renderer, { id: "sidebar-hint", content: "ctrl+e", fg: T4, width: "100%", flexShrink: 0 });
		this.box.add(this.hint);
		renderer.on(CliRenderEvents.RESIZE, () => {
			this.resize();
		});
	}

	start(): void {
		this.timer ??= setInterval(() => {
			this.rows = entries(this.bots);
			this.draw();
		}, TICK_MS);
		void this.reload();
	}

	async reload(): Promise<void> {
		this.bots = await listBots();
		this.rows = entries(this.bots);
		this.draw();
	}

	show(bot: BotInfo | null): void {
		this.current = bot?.id ?? null;
		this.draw();
	}

	get active(): boolean {
		return this.focused;
	}

	get typing(): boolean {
		return this.searching;
	}

	focus(): void {
		this.focused = true;
		this.searching = true;
		this.search.visible = true;
		this.search.value = "";
		this.search.focus();
		this.cursor = Math.max(0, this.visible().findIndex((entry) => entry.bot.id === this.current));
		this.resize();
		this.draw();
	}

	blur(): void {
		this.focused = false;
		this.searching = false;
		this.search.blur();
		this.search.value = "";
		this.search.visible = false;
		this.resize();
		this.draw();
	}

	move(step: number): void {
		const count = this.visible().length;
		if (count === 0) {
			return;
		}
		if (this.searching) {
			this.searching = false;
			this.search.blur();
		} else {
			this.cursor = Math.min(count - 1, Math.max(0, this.cursor + step));
		}
		this.draw();
		this.choose();
	}

	choose(): void {
		const entry = this.visible()[this.cursor];
		if (entry && entry.bot.id !== this.current) {
			this.open(entry.bot);
		}
	}

	private visible(): Entry[] {
		const filter = this.search.value.trim().toLowerCase();
		if (filter === "") {
			return this.rows;
		}
		return this.rows.filter((entry) => entry.bot.name.toLowerCase().includes(filter));
	}

	private get narrow(): boolean {
		return this.renderer.terminalWidth < NARROW_TERMINAL && !this.focused;
	}

	private resize(): void {
		this.box.width = this.narrow ? NARROW_COLS : WIDE_COLS;
		this.hint.content = this.hintText();
		this.title.content = this.narrow ? "" : "bots";
	}

	private hintText(): string {
		if (this.narrow) {
			return "";
		}
		if (this.focused) {
			return "↑↓ abre · enter fica";
		}
		return "ctrl+e";
	}

	private row(entry: Entry, index: number, inner: number): Line {
		const tail = entry.fronts > 0 ? ` ·${entry.fronts}` : "";
		const name = cut(entry.bot.name, Math.max(0, inner - 2 - tail.length));
		const text = `${entry.mark} ${name}${tail}`;
		if (this.focused && index === this.cursor) {
			return { text, fg: T1 };
		}
		if (entry.bot.id === this.current) {
			return { text, fg: T1 };
		}
		return { text, fg: T2 };
	}

	private draw(): void {
		if (this.narrow) {
			this.lines.set(this.rows.map((entry) => ({ text: entry.mark, fg: entry.bot.id === this.current ? T1 : T2 })));
			return;
		}
		const inner = WIDE_COLS - 2;
		const rows = this.visible();
		if (rows.length === 0) {
			this.lines.set([{ text: "nenhum bot", fg: T4 }]);
			return;
		}
		this.lines.set(rows.map((entry, index) => this.row(entry, index, inner)));
	}
}
