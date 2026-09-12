export type TurnState = "loading" | "ready" | "thinking" | "cancelling" | "cancelled" | "waiting" | "error";

const BUSY_LABELS: Partial<Record<TurnState, string>> = { loading: "loading", thinking: "thinking", cancelling: "stopping" };

export class Turn {
	private current: TurnState = "loading";
	private tooled = false;

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
	}

	start(): void {
		this.tooled = false;
		this.current = "thinking";
	}

	ranTool(): void {
		this.tooled = true;
	}

	finish(): void {
		if (this.current === "cancelled" || this.current === "error" || this.current === "waiting") {
			return;
		}
		this.current = "ready";
	}
}
