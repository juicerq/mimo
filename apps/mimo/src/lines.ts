import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";

export interface Line {
	text: string;
	fg: string;
}

export class Lines {
	private readonly renderer: CliRenderer;
	private readonly box: BoxRenderable;
	private current: Line[] = [];

	constructor(renderer: CliRenderer, box: BoxRenderable) {
		this.renderer = renderer;
		this.box = box;
	}

	set(lines: Line[]): void {
		if (lines.length === this.current.length && lines.every((line, index) => line.text === this.current[index]?.text && line.fg === this.current[index]?.fg)) {
			return;
		}
		this.current = lines;
		for (const child of this.box.getChildren()) {
			child.destroyRecursively();
		}
		for (const line of lines) {
			this.box.add(new TextRenderable(this.renderer, {
				content: line.text,
				fg: line.fg,
				width: "100%",
				wrapMode: "word",
			}));
		}
	}
}
