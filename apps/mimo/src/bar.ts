import { BoxRenderable, type CliRenderer } from "@opentui/core";
import { Lines } from "./lines";
import { T6 } from "./theme";

export type TeamView = "off" | "rail";

export const NEXT_TEAM_VIEW: Record<TeamView, TeamView> = {
	off: "rail",
	rail: "off",
};

export class Bar {
	readonly box: BoxRenderable;
	private readonly lines: Lines;
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

	stop(): void {
		this.items = [];
		this.draw();
	}

	private draw(): void {
		this.lines.set(this.items.map((item) => ({ text: `queue: ${item}`, fg: T6 })));
	}
}

export function elapsed(startedAt: number): string {
	const seconds = Math.floor((Date.now() - startedAt) / 1000);
	if (seconds < 60) {
		return `${seconds}s`;
	}
	return `${Math.floor(seconds / 60)}m`;
}
