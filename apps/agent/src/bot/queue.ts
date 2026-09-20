import type { Entry } from "./events";
import type { BotEvent } from "./types";

interface Queued {
	entry: Entry;
	done: (failure: string | null) => void;
}

export class Queue {
	private readonly waiting: Queued[] = [];
	private readonly running: Queued[] = [];

	constructor(private readonly emit: (event: BotEvent) => void) {}

	get texts(): string[] {
		return this.waiting.filter((item) => item.entry.kind === "user").map((item) => item.entry.text);
	}

	add(entry: Entry): Promise<string | null> {
		const ran = new Promise<string | null>((done) => {
			this.waiting.push({ entry, done });
		});
		this.announce();
		return ran;
	}

	take(): Entry[] {
		if (this.waiting.length === 0) {
			return [];
		}
		const taken = this.waiting.splice(0, this.waiting.length);
		this.running.push(...taken);
		this.announce();
		return taken.map((item) => item.entry);
	}

	settle(failure: string | null): void {
		for (const item of this.running.splice(0, this.running.length)) {
			item.done(failure);
		}
	}

	discard(failure: string | null): void {
		for (const item of this.waiting.splice(0, this.waiting.length)) {
			item.done(failure);
		}
		this.announce();
	}

	private announce(): void {
		this.emit({ type: "queue", items: this.texts });
	}
}
