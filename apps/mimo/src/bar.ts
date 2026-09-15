import { BoxRenderable, type CliRenderer } from "@opentui/core";
import type { BotActivity } from "@agent/bot/registry";
import type { TeamMember } from "@agent/bot/types";
import { Lines } from "./lines";
import { cols, pad } from "./text";
import { T6 } from "./theme";

const TEAM_MS = 1000;

export type TeamView = "off" | "bar" | "rail";

export const NEXT_TEAM_VIEW: Record<TeamView, TeamView> = {
	off: "bar",
	bar: "rail",
	rail: "off",
};

interface Source {
	read: () => readonly BotActivity[];
	botId: string;
}

export class Bar {
	readonly box: BoxRenderable;
	private readonly lines: Lines;
	private source: Source | null = null;
	private teamView: TeamView = "bar";
	private timer: ReturnType<typeof setInterval> | null = null;
	private items: readonly string[] = [];

	constructor(renderer: CliRenderer) {
		this.box = new BoxRenderable(renderer, {
			id: "bar",
			width: "100%",
			flexDirection: "column",
			flexShrink: 0,
			paddingLeft: 2,
		});
		this.lines = new Lines(renderer, this.box);
	}

	queue(items: readonly string[]): void {
		this.items = items;
		this.draw();
	}

	watch(source: Source): void {
		this.source = source;
		this.timer ??= setInterval(() => this.draw(), TEAM_MS);
		this.draw();
	}

	view(teamView: TeamView): void {
		this.teamView = teamView;
		this.draw();
	}

	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.source = null;
		this.items = [];
		this.draw();
	}

	private draw(): void {
		const texts = [...this.teamLines(), ...this.items.map((item) => `queue: ${item}`)];
		this.lines.set(texts.map((text) => ({ text, fg: T6 })));
	}

	private teamLines(): string[] {
		const source = this.source;
		if (this.teamView !== "bar" || source === null) {
			return [];
		}
		const bots = source.read();
		const team = bots.find((bot) => bot.id === source.botId)?.team ?? [];
		const width = Math.max(0, ...team.map((member) => cols(member.name)));
		const lines = team.map((member) => teamLine(member, width));
		const elsewhere = bots.filter((bot) => bot.id !== source.botId).flatMap(elsewhereMark);
		if (elsewhere.length === 0) {
			return lines;
		}
		return [...lines, `elsewhere: ${elsewhere.join(", ")}`];
	}
}

function elsewhereMark(bot: BotActivity): string[] {
	if (bot.failed !== null) {
		return [`${bot.name} ✗ error`];
	}
	if (bot.waiting !== null) {
		return [`${bot.name} ⏸ approval: ${bot.waiting}`];
	}
	return [];
}

function teamLine(member: TeamMember, width: number): string {
	return `${pad(member.name, width)} ${elapsed(member.startedAt).padStart(4)}  ${member.task}`;
}

export function elapsed(startedAt: number): string {
	const seconds = Math.floor((Date.now() - startedAt) / 1000);
	if (seconds < 60) {
		return `${seconds}s`;
	}
	return `${Math.floor(seconds / 60)}m`;
}
