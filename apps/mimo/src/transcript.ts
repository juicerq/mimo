import { ScrollBoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";
import { T1, T4 } from "./theme";

const DETAIL_LEVELS = ["off", "brief", "full"] as const;
const DETAIL_CHARACTERS = 600;
const INDENT_CHARACTERS = 240;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_MS = 100;

export type Detail = (typeof DETAIL_LEVELS)[number];

export class Transcript {
	readonly box: ScrollBoxRenderable;
	private readonly renderer: CliRenderer;
	private detail: Detail = "brief";
	private speaker = "";
	private replyLine: TextRenderable | null = null;
	private replyText = "";
	private spinner: { line: TextRenderable; label: string; startedAt: number; timer: ReturnType<typeof setInterval> } | null = null;

	constructor(renderer: CliRenderer) {
		this.renderer = renderer;
		this.box = new ScrollBoxRenderable(renderer, {
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
			contentOptions: { justifyContent: "flex-end", minHeight: "100%" },
		});
	}

	cycle(): Detail {
		this.detail = DETAIL_LEVELS[(DETAIL_LEVELS.indexOf(this.detail) + 1) % DETAIL_LEVELS.length];
		return this.detail;
	}

	clear(speaker = ""): void {
		this.speaker = speaker;
		this.stopWorking();
		this.seal();
		for (const child of this.box.getChildren()) {
			child.destroyRecursively();
		}
		this.box.scrollTo(0);
	}

	toBottom(): void {
		this.box.scrollTo(this.box.scrollHeight);
	}

	note(content: string, tone = T1): void {
		this.append(content, tone);
	}

	indented(text: string): void {
		this.append(`   ${truncate(text, INDENT_CHARACTERS)}`, T4);
	}

	tool(name: string, input: unknown): void {
		this.brief(`⚙ ${name}`, T4, JSON.stringify(input), 0);
	}

	detailed(brief: string, tone: string, detail?: string): void {
		this.brief(brief, tone, detail, 1);
	}

	result(output: string): void {
		this.appendDetail(output, 1);
	}

	replyDelta(delta: string): void {
		const block = this.ensureReply();
		this.replyText += delta;
		block.content = `${this.speaker}: ${this.replyText}`;
	}

	reply(text: string): void {
		if (text !== "") {
			const block = this.ensureReply();
			this.replyText = text;
			block.content = `${this.speaker}: ${text}`;
		}
		this.seal();
	}

	seal(): void {
		this.replyLine = null;
		this.replyText = "";
	}

	working(label: string | undefined): void {
		if (label === undefined) {
			this.stopWorking();
			return;
		}
		const working = this.spinner;
		if (working) {
			working.label = label;
			this.drawWorking();
			return;
		}
		const line = this.append("", T4);
		this.spinner = { line, label, startedAt: performance.now(), timer: setInterval(() => this.drawWorking(), SPINNER_MS) };
		this.drawWorking();
	}

	private shows(need: Detail): boolean {
		return DETAIL_LEVELS.indexOf(this.detail) >= DETAIL_LEVELS.indexOf(need);
	}

	private brief(content: string, tone: string, detail: string | undefined, detailMargin: number): void {
		if (!this.shows("brief")) {
			return;
		}
		const extra = trimmed(detail);
		this.append(content, tone, this.shows("full") && extra ? 0 : 1);
		this.appendDetail(extra, detailMargin);
	}

	private appendDetail(text: string | undefined, marginBottom: number): void {
		const detail = trimmed(text);
		if (!this.shows("full") || detail === undefined) {
			return;
		}
		this.append(`   ${truncate(detail, DETAIL_CHARACTERS)}`, T4, marginBottom);
	}

	private ensureReply(): TextRenderable {
		if (this.replyLine) {
			return this.replyLine;
		}
		this.stopWorking();
		this.replyText = "";
		this.replyLine = this.append(`${this.speaker}: `, T1);
		return this.replyLine;
	}

	private append(content: string, fg: string, marginBottom = 1): TextRenderable {
		const line = new TextRenderable(this.renderer, {
			content,
			fg,
			width: "100%",
			wrapMode: "word",
			marginBottom,
		});
		this.box.add(line);
		this.raiseWorking();
		return line;
	}

	private drawWorking(): void {
		const working = this.spinner;
		if (!working) {
			return;
		}
		const elapsed = performance.now() - working.startedAt;
		const frame = SPINNER[Math.floor(elapsed / SPINNER_MS) % SPINNER.length];
		const hint = working.label === "loading" ? "" : " · esc esc to stop";
		working.line.content = `${frame} ${working.label} · ${Math.floor(elapsed / 1000)}s${hint}`;
	}

	private stopWorking(): void {
		const working = this.spinner;
		if (!working) {
			return;
		}
		clearInterval(working.timer);
		this.spinner = null;
		this.box.remove(working.line);
		working.line.destroyRecursively();
	}

	private raiseWorking(): void {
		const working = this.spinner;
		if (!working) {
			return;
		}
		this.box.remove(working.line);
		this.box.add(working.line);
	}
}

function trimmed(text: string | undefined): string | undefined {
	const detail = text?.trim();
	if (!detail || detail === "{}") {
		return undefined;
	}
	return detail;
}

function truncate(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max)}…`;
}
