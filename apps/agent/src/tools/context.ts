import type { LoginSession, LoginTarget } from "../login/login";
import type { BotPatch } from "../bot/store";
import type { BotInfo, BotMode, Delegation, TeamMember, ToolGroup } from "../bot/types";

export interface ToolContext {
	readonly botId: string;
	readonly folder?: string;
	readonly mode: BotMode;
	readonly parentId?: string;
	readonly tools: ToolGroup[];
	setMode(mode: BotMode): Promise<void>;
	setTools(tools: ToolGroup[]): Promise<BotInfo>;
	login(target: LoginTarget): LoginSession;
	delegate(delegation: Delegation): Promise<void>;
	stopChild(botId: string): string;
	readonly team: TeamMember[];
	updateChild(botId: string, patch: BotPatch): Promise<BotInfo>;
	deleteChild(botId: string): Promise<void>;
}
