import type { LoginSession, LoginTarget } from "../login/login";
import type { BotPatch } from "../bot/store";
import type { BotInfo, BotMode, TeamMember, ToolGroup } from "../bot/types";

export interface ToolContext {
	readonly botId: string;
	readonly sessionId: string;
	readonly mode: BotMode;
	readonly parentId?: string;
	readonly tools: ToolGroup[];
	setMode(mode: BotMode): void;
	login(target: LoginTarget): LoginSession;
	delegate(botId: string, prompt: string): Promise<void>;
	stopChild(botId: string): string;
	readonly team: TeamMember[];
	updateChild(botId: string, patch: BotPatch): Promise<BotInfo>;
	deleteChild(botId: string): Promise<void>;
}
