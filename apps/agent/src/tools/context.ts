import type { LoginSession, LoginTarget } from "../login/login";
import type { BotMode } from "../bot/types";

export interface ToolContext {
	readonly botId: string;
	readonly sessionId: string;
	readonly mode: BotMode;
	setMode(mode: BotMode): void;
	login(target: LoginTarget): LoginSession;
}
