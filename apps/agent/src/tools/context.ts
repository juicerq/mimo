import type { BotMode } from "../bot/types";

export interface ToolContext {
	readonly botId: string;
	readonly sessionId: string;
	readonly mode: BotMode;
	setMode(mode: BotMode): void;
}
