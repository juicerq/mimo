import type { Approval, BotEvent } from "./types";

interface Pending {
	approval: Approval;
	resolve: (approved: boolean) => void;
}

export class Approvals {
	private readonly pending: Pending[] = [];

	constructor(private readonly emit: (event: BotEvent) => void) {}

	get current(): Approval | null {
		return this.pending[0]?.approval ?? null;
	}

	ask(approval: Approval, signal?: AbortSignal): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			const entry: Pending = { approval, resolve };
			this.pending.push(entry);
			signal?.addEventListener("abort", () => this.settle(entry, false), { once: true });
			if (this.pending[0] === entry) {
				this.emit({ type: "approval", approval });
			}
		});
	}

	resolve(id: string, approved: boolean): boolean {
		const entry = this.pending[0];
		if (entry?.approval.id !== id) {
			return false;
		}
		this.settle(entry, approved);
		return true;
	}

	denyAll(): void {
		for (const entry of this.pending.slice()) {
			this.settle(entry, false);
		}
	}

	private settle(entry: Pending, approved: boolean): void {
		const index = this.pending.indexOf(entry);
		if (index === -1) {
			return;
		}
		this.pending.splice(index, 1);
		entry.resolve(approved);
		this.emit({ type: "approval-resolved", outcome: approved ? "approved" : "denied" });
		const next = this.pending[0];
		if (next) {
			this.emit({ type: "approval", approval: next.approval });
		}
	}
}
