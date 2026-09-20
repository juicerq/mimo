import type { LoginSession, LoginTarget } from "../login/login";
import type { BotPatch } from "../bot/store";
import type { BotInfo, Delegation, TeamMember } from "../bot/types";

export interface ToolContext {
	readonly botId: string;
	readonly parentId?: string;
	login(target: LoginTarget): LoginSession;
	delegate(delegation: Delegation): Promise<void>;
	stopChild(botId: string): string;
	readonly team: TeamMember[];
	updateChild(botId: string, patch: BotPatch): Promise<BotInfo>;
	deleteChild(botId: string): Promise<void>;
}
