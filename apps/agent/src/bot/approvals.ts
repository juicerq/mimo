import type { Approval, BotEvent } from "./types";

interface Pending {
	approval: Approval;
	resolve: (approved: boolean) => void;
	reject: (error: unknown) => void;
	cleanup: () => void;
}

export class Approvals {
	private readonly pending: Pending[] = [];

	constructor(private readonly emit: (event: BotEvent) => void) {}

	get current(): Approval | null {
		return this.pending[0]?.approval ?? null;
	}

	ask(approval: Approval, signal?: AbortSignal): Promise<boolean> {
		if (signal?.aborted) {
			return Promise.resolve(false);
		}
		return new Promise<boolean>((resolve, reject) => {
			const abort = () => { this.settle(entry, false); };
			const entry: Pending = { approval, resolve, reject, cleanup: () => signal?.removeEventListener("abort", abort) };
			if (this.pending.length === 0) {
				this.emit({ type: "approval", approval });
			}
			this.pending.push(entry);
			signal?.addEventListener("abort", abort, { once: true });
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
		try {
			this.emit({ type: "approval-resolved", id: entry.approval.id, outcome: approved ? "approved" : "denied" });
		} catch (error) {
			entry.reject(error);
			throw error;
		} finally {
			this.pending.splice(index, 1);
			entry.cleanup();
		}
		entry.resolve(approved);
		const next = this.pending[0];
		if (index === 0 && next) {
			this.emit({ type: "approval", approval: next.approval });
		}
	}
}
