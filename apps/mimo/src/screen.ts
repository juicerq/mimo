import type { Bot } from "@agent/bot/bot";
import type { BotEvent, BotInfo } from "@agent/bot/types";

const LIST_PLACEHOLDER = "number or /new <name>";
const CONVERSATION_PLACEHOLDER = "write your prompt";

export class Screen {
	private record: BotInfo | null = null;
	private listed: readonly BotInfo[] = [];
	private live: Bot | null = null;
	private unsubscribe: (() => void) | null = null;
	private lifetime = new AbortController();

	get listing(): boolean {
		return this.record === null;
	}

	get bot(): BotInfo | null {
		return this.live?.info ?? this.record;
	}

	get bots(): readonly BotInfo[] {
		return this.listed;
	}

	get conversation(): Bot | null {
		return this.live;
	}

	get placeholder(): string {
		if (this.listing) {
			return LIST_PLACEHOLDER;
		}
		return CONVERSATION_PLACEHOLDER;
	}

	get signal(): AbortSignal {
		return this.lifetime.signal;
	}

	show(bot: BotInfo | null): AbortSignal {
		this.lifetime.abort();
		this.lifetime = new AbortController();
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.live = null;
		this.record = bot;
		this.listed = [];
		return this.lifetime.signal;
	}

	list(bots: readonly BotInfo[]): void {
		this.listed = bots;
	}

	connect(conversation: Bot, onEvent: (event: BotEvent) => void): void {
		const signal = this.lifetime.signal;
		this.unsubscribe?.();
		this.live = conversation;
		this.unsubscribe = conversation.subscribe((event) => {
			if (!signal.aborted) {
				onEvent(event);
			}
		});
	}

	require(): Bot {
		if (!this.live) {
			throw new Error("Open a bot first.");
		}
		return this.live;
	}
}
