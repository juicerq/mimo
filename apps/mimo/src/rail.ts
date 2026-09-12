import { BoxRenderable, CliRenderEvents, TextRenderable, type CliRenderer } from "@opentui/core";
import { activity, type BotActivity } from "@agent/bot/bot";
import { elapsed } from "./bar";
import { T1, T2, T3, T4, T5 } from "./theme";

const RAIL_MS = 1000;
const RAIL_COLS = 44;

interface Line {
	text: string;
	fg: string;
}

export class Rail {
	readonly box: BoxRenderable;
	private readonly renderer: CliRenderer;
	private readonly list: BoxRenderable;
	private timer: ReturnType<typeof setInterval> | null = null;
	private lines: Line[] = [];

	constructor(renderer: CliRenderer) {
		this.renderer = renderer;
		this.box = new BoxRenderable(renderer, {
			id: "rail",
			width: 0,
			height: "100%",
			flexShrink: 0,
			flexDirection: "column",
			border: ["left"],
			borderColor: T5,
			paddingLeft: 1,
			paddingRight: 1,
			visible: false,
		});
		this.list = new BoxRenderable(renderer, {
			id: "rail-list",
			width: "100%",
			flexGrow: 1,
			minHeight: 0,
			flexDirection: "column",
			paddingTop: 1,
		});
		this.box.add(this.list);
		this.box.add(new TextRenderable(renderer, {
			id: "rail-hint",
			content: "Ctrl+T close",
			fg: T4,
			width: "100%",
			flexShrink: 0,
		}));
		renderer.on(CliRenderEvents.RESIZE, () => {
			this.resize();
		});
	}

	show(): void {
		this.box.visible = true;
		this.resize();
		this.timer ??= setInterval(() => this.draw(), RAIL_MS);
		this.draw();
	}

	hide(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.box.visible = false;
		this.box.width = 0;
	}

	private resize(): void {
		if (!this.box.visible) {
			return;
		}
		this.box.width = Math.min(RAIL_COLS, Math.floor(this.renderer.terminalWidth / 3));
	}

	private draw(): void {
		const lines = this.read();
		if (lines.length === this.lines.length && lines.every((line, index) => line.text === this.lines[index]?.text && line.fg === this.lines[index]?.fg)) {
			return;
		}
		this.lines = lines;
		for (const child of this.list.getChildren()) {
			child.destroyRecursively();
		}
		for (const line of lines) {
			this.list.add(new TextRenderable(this.renderer, {
				content: line.text,
				fg: line.fg,
				width: "100%",
				wrapMode: "word",
			}));
		}
	}

	private read(): Line[] {
		const bots = activity().filter((bot) => bot.team.length > 0 || bot.waiting !== null);
		if (bots.length === 0) {
			return [{ text: "nothing running", fg: T4 }];
		}
		const lines: Line[] = [];
		for (const bot of bots) {
			lines.push(...lines.length > 0 ? [{ text: "", fg: T4 }] : [], { text: head(bot), fg: T1 });
			lines.push(...body(bot));
		}
		return lines;
	}
}

function head(bot: BotActivity): string {
	const marks = [...bot.team.length > 0 ? [`${bot.team.length} working`] : [], ...bot.waiting === null ? [] : ["waiting"]];
	return `${bot.name} · ${marks.join(" · ")}`;
}

function body(bot: BotActivity): Line[] {
	const lines: Line[] = [];
	const width = Math.max(0, ...bot.team.map((member) => member.name.length));
	for (const member of bot.team) {
		lines.push({ text: `  ${member.name.padEnd(width)} ${elapsed(member.startedAt).padStart(4)}  ${member.tool ?? ""}`.trimEnd(), fg: T2 });
		lines.push({ text: `  ${member.task}`, fg: T3 });
		if (member.worktree !== null) {
			lines.push({ text: `  ${member.worktree}`, fg: T4 });
		}
	}
	if (bot.waiting !== null) {
		lines.push({ text: `  ⏸ approval: ${bot.waiting}`, fg: T2 });
	}
	return lines;
}
