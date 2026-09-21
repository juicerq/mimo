export const BROWSER_KEYS = ["Enter", "Tab", "Escape", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;

export type BrowserKey = (typeof BROWSER_KEYS)[number];

export type Direction = "up" | "down";

export interface Page {
	url: string;
	title: string;
	snapshot: string;
}

export interface Shot {
	url: string;
	title: string;
	photo: string | null;
}

export interface BrowserView {
	open(url: string): Promise<void>;
	click(ref: string): Promise<void>;
	fill(ref: string, text: string): Promise<void>;
	press(key: BrowserKey): Promise<void>;
	scroll(direction: Direction): Promise<void>;
	read(): Promise<Page>;
	shot(): Promise<Shot>;
	present(open: boolean): void;
	close(): void;
}

export type BrowserEvent =
	| { type: "page"; url: string; title: string; photo: string | null }
	| { type: "showing"; open: boolean }
	| { type: "closed" };

const SAME_PAGE = "A página continua igual ao último look.";
const NO_PAGE = "Nenhuma página aberta. Use open com uma url antes.";

export class BrowserSession {
	private readonly listeners = new Set<(event: BrowserEvent) => void>();
	private readonly history: BrowserEvent[] = [];
	private opened: BrowserView | null = null;
	private waiting: ((helped: boolean) => void) | null = null;
	private last = "";
	private shown = false;

	constructor(
		private readonly make: () => BrowserView,
		private readonly forget: () => void,
	) {}

	get past(): readonly BrowserEvent[] {
		return this.history;
	}

	subscribe(listener: (event: BrowserEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async open(url: string): Promise<Page> {
		await this.view().open(url);
		return await this.look();
	}

	async look(): Promise<Page> {
		const page = await this.started().read();
		await this.publish();
		if (page.snapshot === this.last) {
			return { ...page, snapshot: SAME_PAGE };
		}
		this.last = page.snapshot;
		return page;
	}

	async click(ref: string): Promise<Page> {
		await this.started().click(ref);
		return await this.look();
	}

	async fill(ref: string, text: string): Promise<Page> {
		await this.started().fill(ref, text);
		return await this.look();
	}

	async press(key: BrowserKey): Promise<Page> {
		await this.started().press(key);
		return await this.look();
	}

	async scroll(direction: Direction): Promise<Page> {
		await this.started().scroll(direction);
		return await this.look();
	}

	async handoff(signal?: AbortSignal): Promise<{ helped: boolean } & Partial<Page>> {
		this.started();
		const helped = await this.wait(signal);
		this.present(false);
		if (!helped) {
			return { helped: false };
		}
		return { helped: true, ...(await this.look()) };
	}

	present(open: boolean): void {
		if (!this.opened || this.shown === open) {
			return;
		}
		this.shown = open;
		this.opened.present(open);
		this.emit({ type: "showing", open });
	}

	answer(helped: boolean): void {
		const waiting = this.waiting;
		if (!waiting) {
			this.present(false);
			return;
		}
		this.waiting = null;
		waiting(helped);
	}

	close(): void {
		this.answer(false);
		this.opened?.close();
		this.opened = null;
		this.shown = false;
		this.last = "";
		this.emit({ type: "closed" });
		this.forget();
	}

	private view(): BrowserView {
		this.opened ??= this.make();
		return this.opened;
	}

	private started(): BrowserView {
		if (!this.opened) {
			throw new Error(NO_PAGE);
		}
		return this.opened;
	}

	private async wait(signal?: AbortSignal): Promise<boolean> {
		return await new Promise<boolean>((resolve) => {
			this.waiting = resolve;
			signal?.addEventListener("abort", () => this.answer(false), { once: true });
		});
	}

	private async publish(): Promise<void> {
		if (!this.opened) {
			return;
		}
		const shot = await this.opened.shot();
		this.emit({ type: "page", ...shot });
	}

	private emit(event: BrowserEvent): void {
		this.remember(event);
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	private remember(event: BrowserEvent): void {
		this.drop(event.type);
		this.history.push(event);
	}

	private drop(type: BrowserEvent["type"]): void {
		const at = this.history.findIndex((entry) => entry.type === type);
		if (at >= 0) {
			this.history.splice(at, 1);
		}
	}
}
