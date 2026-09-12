export type TurnState = "loading" | "ready" | "thinking" | "cancelling" | "cancelled" | "waiting" | "error";

const BUSY_LABELS: Partial<Record<TurnState, string>> = { loading: "loading", thinking: "thinking", cancelling: "stopping" };

export class Turn {
	private readonly redraw: () => void;
	private current: TurnState = "loading";
	private tooled = false;

	constructor(redraw: () => void) {
		this.redraw = redraw;
	}

	get state(): TurnState {
		return this.current;
	}

	get busy(): boolean {
		return BUSY_LABELS[this.current] !== undefined;
	}

	get idle(): boolean {
		return !this.busy && this.current !== "waiting";
	}

	get label(): string | undefined {
		const label = BUSY_LABELS[this.current];
		if (label === "thinking" && this.tooled) {
			return "working";
		}
		return label;
	}

	enter(state: TurnState): void {
		this.current = state;
		this.redraw();
	}

	start(): void {
		this.tooled = false;
		this.current = "thinking";
		this.redraw();
	}

	ranTool(): void {
		this.tooled = true;
		this.redraw();
	}

	finish(): void {
		if (this.current === "cancelled" || this.current === "error" || this.current === "waiting") {
			return;
		}
		this.current = "ready";
		this.redraw();
	}
}
