import { BoxRenderable, ScrollBoxRenderable, TextRenderable, type CliRenderer, type InputRenderable } from "@opentui/core";
import type { BotInfo } from "@agent/bot/types";
import { describeError } from "./errors";
import { T3, TONES, type Tone } from "./theme";
export const CANCEL_HINT = "/cancel to return or press Esc";
const NUMBER_PLACEHOLDER = "number or /cancel";

export type PanelState = "loading" | "ready" | "saving";

export interface PanelResult {
	message?: string;
	bot?: BotInfo;
	list?: boolean;
}

export interface PanelView {
	line(content: string, tone?: Tone, tight?: boolean): void;
	state(state: PanelState): void;
	saving(action: () => Promise<void>): void;
	placeholder(text: string): void;
	show(panel: Panel): void;
	close(result?: PanelResult): void;
}

export interface Panel {
	heading: string;
	placeholder?: string;
	start(view: PanelView): void;
	submit?(text: string, view: PanelView): void;
	cancel?(): void;
	copy?(view: PanelView): boolean;
}

interface Choice<Id extends string> {
	id: Id;
	label: string;
	group?: string;
}

interface ChoiceList<Id extends string> {
	choices: Choice<Id>[];
	notes?: string[];
}

export interface ChoiceSpec<Id extends string> {
	heading: string;
	empty?: string;
	load(): ChoiceList<Id> | Promise<ChoiceList<Id>>;
	pick(id: Id, view: PanelView): void;
}

export function choicePanel<Id extends string>(spec: ChoiceSpec<Id>): Panel {
	let choices: Choice<Id>[] = [];

	return {
		heading: spec.heading,
		start(view) {
			void render(spec, view).then((loaded) => {
				choices = loaded;
			});
		},
		submit(text, view) {
			if (!/^[1-9]\d*$/.test(text)) {
				view.line("Choose a number, or /cancel to return.", "note");
				return;
			}
			const choice = choices[Number(text) - 1];
			if (!choice) {
				view.line("Choose one of the listed numbers.", "note");
				return;
			}
			spec.pick(choice.id, view);
		},
	};
}

async function render<Id extends string>(spec: ChoiceSpec<Id>, view: PanelView): Promise<Choice<Id>[]> {
	try {
		const list = await spec.load();
		let group: string | null = null;
		for (const [index, choice] of list.choices.entries()) {
			if (choice.group !== undefined && choice.group !== group) {
				if (group !== null) {
					view.line("", "hint", true);
				}
				group = choice.group;
				view.line(group, "hint", true);
			}
			view.line(`${index + 1}. ${choice.label}`, "item", true);
		}
		if (list.choices.length === 0 && spec.empty !== undefined) {
			view.line(spec.empty, "note", true);
		}
		for (const note of list.notes ?? []) {
			view.line(note, "note");
		}
		view.line(CANCEL_HINT, "hint");
		view.state("ready");
		return list.choices;
	} catch (error) {
		view.line(describeError(error), "error");
		view.state("ready");
		return [];
	}
}

export class Panels {
	readonly row: BoxRenderable;
	readonly box: ScrollBoxRenderable;
	private readonly renderer: CliRenderer;
	private readonly input: InputRenderable;
	private readonly refresh: () => void;
	private readonly finish: (result: PanelResult) => void;
	private readonly heading: TextRenderable;
	private panel: Panel | null = null;
	private view: PanelView | null = null;
	private token = {};
	private draft = "";
	private current: PanelState = "ready";

	constructor(renderer: CliRenderer, options: { input: InputRenderable; refresh: () => void; finish: (result: PanelResult) => void }) {
		this.renderer = renderer;
		this.input = options.input;
		this.refresh = options.refresh;
		this.finish = options.finish;
		this.heading = new TextRenderable(renderer, { id: "heading", content: "", fg: T3 });
		this.row = new BoxRenderable(renderer, { width: "100%", paddingLeft: 2, flexShrink: 0, visible: false });
		this.row.add(this.heading);
		this.box = new ScrollBoxRenderable(renderer, {
			width: "100%", flexGrow: 1, minHeight: 0, paddingTop: 1,
			paddingLeft: 2, paddingRight: 2, visible: false,
			contentOptions: { justifyContent: "flex-end", minHeight: "100%" },
		});
	}

	get active(): boolean {
		return this.panel !== null;
	}

	get state(): PanelState {
		return this.current;
	}

	show(panel: Panel): void {
		if (this.panel === null) {
			this.draft = this.input.value;
		}
		this.panel = panel;
		this.token = {};
		this.current = "loading";
		this.clear();
		this.box.scrollTo(0);
		this.row.visible = true;
		this.box.visible = true;
		this.heading.content = panel.heading;
		this.input.value = "";
		this.input.placeholder = panel.placeholder ?? NUMBER_PLACEHOLDER;
		this.view = this.makeView(this.token);
		this.refresh();
		panel.start(this.view);
	}

	submit(text: string): void {
		const view = this.view;
		if (this.current !== "ready" || !view) {
			return;
		}
		this.input.value = "";
		this.panel?.submit?.(text, view);
	}

	copyLink(): boolean {
		const view = this.view;
		if (!view || !this.panel?.copy) {
			return false;
		}
		return this.panel.copy(view);
	}

	readonly cancel = (): void => {
		this.panel?.cancel?.();
		this.close();
	};

	dismiss(): void {
		this.panel?.cancel?.();
		this.teardown();
	}

	private close(result: PanelResult = {}): void {
		this.teardown();
		this.finish(result);
	}

	private teardown(): void {
		if (this.panel === null) {
			return;
		}
		this.panel = null;
		this.view = null;
		this.token = {};
		this.current = "ready";
		this.row.visible = false;
		this.box.visible = false;
		this.clear();
		this.input.value = this.draft;
		this.draft = "";
		this.refresh();
	}

	private clear(): void {
		for (const child of this.box.getChildren()) {
			child.destroyRecursively();
		}
	}

	private line(content: string, tone: Tone, tight: boolean): void {
		this.box.add(new TextRenderable(this.renderer, {
			content, fg: TONES[tone], width: "100%", wrapMode: "word", marginBottom: tight ? 0 : 1,
		}));
	}

	private makeView(token: object): PanelView {
		const alive = (): boolean => this.token === token;

		const view: PanelView = {
			line: (content, tone = "item", tight = false) => {
				if (alive()) {
					this.line(content, tone, tight);
				}
			},
			state: (state) => {
				if (alive()) {
					this.current = state;
					this.refresh();
				}
			},
			saving: (action) => {
				view.state("saving");
				void action().catch((error: unknown) => {
					view.line(describeError(error), "error");
					view.state("ready");
				});
			},
			placeholder: (text) => {
				if (alive()) {
					this.input.placeholder = text;
				}
			},
			show: (panel) => {
				if (alive()) {
					this.show(panel);
				}
			},
			close: (result) => {
				if (alive()) {
					this.close(result);
				}
			},
		};

		return view;
	}
}
