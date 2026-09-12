import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";
import type { TeamMember } from "@agent/bot/types";
import { T4 } from "./theme";

const TEAM_MS = 1000;

export class Bar {
	readonly box: BoxRenderable;
	private readonly renderer: CliRenderer;
	private members: (() => readonly TeamMember[]) | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private items: readonly string[] = [];
	private lines: string[] = [];

	constructor(renderer: CliRenderer) {
		this.renderer = renderer;
		this.box = new BoxRenderable(renderer, {
			id: "bar",
			width: "100%",
			flexDirection: "column",
			flexShrink: 0,
			paddingLeft: 2,
		});
	}

	queue(items: readonly string[]): void {
		this.items = items;
		this.draw();
	}

	watch(members: () => readonly TeamMember[]): void {
		this.members = members;
		this.timer = setInterval(() => this.draw(), TEAM_MS);
		this.draw();
	}

	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.members = null;
		this.items = [];
		this.draw();
	}

	private draw(): void {
		const team = this.members?.() ?? [];
		const width = Math.max(0, ...team.map((member) => member.name.length));
		const lines = [...team.map((member) => teamLine(member, width)), ...this.items.map((item) => `queue: ${item}`)];
		if (lines.length === this.lines.length && lines.every((line, index) => line === this.lines[index])) {
			return;
		}
		this.lines = lines;
		for (const child of this.box.getChildren()) {
			child.destroyRecursively();
		}
		for (const line of lines) {
			this.box.add(new TextRenderable(this.renderer, {
				content: line,
				fg: T4,
				width: "100%",
				wrapMode: "word",
			}));
		}
	}
}

function teamLine(member: TeamMember, width: number): string {
	return `${member.name.padEnd(width)} ${elapsed(member.startedAt).padStart(4)}  ${member.task}`;
}

function elapsed(startedAt: number): string {
	const seconds = Math.floor((Date.now() - startedAt) / 1000);
	if (seconds < 60) {
		return `${seconds}s`;
	}
	return `${Math.floor(seconds / 60)}m`;
}
