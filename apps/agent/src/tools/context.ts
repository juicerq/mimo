import type { LoginSession, LoginTarget } from "../login/login";
import type { Ask, AskResult, ChatKey } from "../bot/types";

export interface ToolContext {
	readonly chat: ChatKey;
	login(target: LoginTarget): LoginSession;
	ask(ask: Ask, signal?: AbortSignal): Promise<AskResult>;
}
