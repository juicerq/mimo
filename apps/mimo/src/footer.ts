import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";
import type { BotInfo, BotMode } from "@agent/bot/types";
import type { ModelInfo } from "@agent/model/types";
import { basename } from "node:path";
import { T4 } from "./theme";
import type { TeamView } from "./bar";
import type { PanelState } from "./panel";
import type { Detail } from "./transcript";

const FLASH_MS = 2000;

export class Footer {
	readonly box: BoxRenderable;
	private readonly line: TextRenderable;
	private contextTokens: number | null = null;
	private selectedModel: ModelInfo | null = null;
	private folderName: string | null = null;
	private botMode: BotMode | null = null;
	private detailLevel: Detail = "brief";
	private teamView: TeamView = "bar";
	private panelState: PanelState | undefined = undefined;
	private readonly flashed = new Set<string>();
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(renderer: CliRenderer) {
		this.line = new TextRenderable(renderer, {
			id: "status",
			content: "",
			fg: T4,
			width: "100%",
		});
		this.box = new BoxRenderable(renderer, {
			id: "status-row",
			width: "100%",
			paddingLeft: 2,
			flexShrink: 0,
		});
		this.box.add(this.line);
	}

	reset(bot: Pick<BotInfo, "model" | "mode" | "folder"> | null): void {
		this.contextTokens = null;
		this.selectedModel = bot?.model ?? null;
		this.folderName = bot?.folder === undefined ? null : basename(bot.folder);
		this.botMode = bot?.mode ?? null;
		this.draw();
	}

	context(tokens: number): void {
		this.contextTokens = tokens;
		this.draw();
	}

	model(info: ModelInfo): void {
		this.selectedModel = info;
		this.draw();
	}

	folder(path: string | undefined): void {
		this.folderName = path === undefined ? null : basename(path);
		this.draw();
	}

	mode(mode: BotMode): void {
		this.botMode = mode;
		this.draw();
	}

	detail(level: Detail): void {
		this.detailLevel = level;
		this.flash("detail");
	}

	team(view: TeamView): void {
		this.teamView = view;
		this.flash("team");
	}

	copied(): void {
		this.flash("copied");
	}

	panel(state: PanelState | undefined): void {
		this.panelState = state;
		this.draw();
	}

	private flash(field: string): void {
		this.flashed.add(field);
		clearTimeout(this.timers.get(field));
		this.timers.set(field, setTimeout(() => {
			this.flashed.delete(field);
			this.draw();
		}, FLASH_MS));
		this.draw();
	}

	private draw(): void {
		const used = this.contextTokens === null ? "0" : formatTokens(this.contextTokens);
		const contextWindow = this.selectedModel?.contextWindowTokens;
		const capacity = contextWindow === undefined ? "—" : formatTokens(contextWindow);
		const parts = [
			`context: ${used}/${capacity}`,
			...this.folderName === null ? [] : [`dir: ${this.folderName}`],
			...this.botMode === null ? [] : [`mode: ${this.botMode === "autonomous" ? "auto" : "normal"}`],
			`model: ${this.selectedModel?.name ?? "—"} (${this.selectedModel?.reasoning ?? "default"})`,
		];
		if (this.flashed.has("detail")) {
			parts.push(`detail: ${this.detailLevel}`);
		}
		if (this.flashed.has("team")) {
			parts.push(`team: ${this.teamView}`);
		}
		if (this.flashed.has("copied")) {
			parts.push("copied");
		}
		if (this.panelState !== undefined) {
			parts.push(`status: ${this.panelState}`);
		}
		this.line.content = parts.join(" | ");
	}
}

function formatTokens(tokens: number): string {
	if (tokens < 1_000) {
		return String(tokens);
	}
	const thousands = tokens / 1_000;
	const text = Number.isInteger(thousands) ? String(thousands) : thousands.toFixed(1);
	return `${text}k`;
}
