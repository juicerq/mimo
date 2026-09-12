import { z } from "zod";
import type { LoginSession, LoginTarget } from "../login/login";
import type { ModelInfo } from "../model/types";

export const BotNameSchema = z.string().trim().min(1).max(80).regex(/^[^\p{Cc}\p{Cf}]+$/u);
export const BotModeSchema = z.enum(["normal", "autonomous"]);
export const BotPromptSchema = z.string().trim().min(1).max(4_000);
export const ToolGroupSchema = z.enum(["computer", "web", "gmail", "routines", "team"]);
export const ChildGroupSchema = ToolGroupSchema.exclude(["team"]);

export const TOOL_GROUPS = ToolGroupSchema.options;
export const CHILD_GROUPS = ChildGroupSchema.options;

export type BotMode = z.infer<typeof BotModeSchema>;
export type ToolGroup = z.infer<typeof ToolGroupSchema>;

export interface BotInfo {
	id: string;
	name: string;
	createdAt: string;
	model: ModelInfo;
	mode: BotMode;
	tools: ToolGroup[];
	parentId?: string;
	prompt?: string;
}

export interface Approval {
	id: string;
	bot: string;
	toolName: string;
	input: unknown;
}

export type TeamCallKind = "created" | "delegated" | "stopped" | "deleted";

export interface TeamCall {
	kind: TeamCallKind;
	bot: string;
}

export interface TeamMember {
	name: string;
	tool: string | null;
	startedAt: number;
}

export type BotEvent =
	| { type: "user"; text: string }
	| { type: "queue"; items: readonly string[] }
	| { type: "note"; text: string }
	| { type: "routine"; name: string; prompt: string }
	| { type: "reply-delta"; delta: string }
	| { type: "reply"; text: string }
	| { type: "tool"; toolName: string; input: unknown }
	| { type: "team-call"; call: TeamCall }
	| { type: "tool-result"; toolName: string; output: string }
	| { type: "tool-failed"; message: string }
	| { type: "approval"; approval: Approval }
	| { type: "login"; target: LoginTarget; session: LoginSession }
	| { type: "approval-resolved"; outcome: "approved" | "denied" }
	| { type: "usage"; contextTokens: number }
	| { type: "mode"; mode: BotMode }
	| { type: "tools"; tools: readonly ToolGroup[] }
	| { type: "turn-started" }
	| { type: "turn-finished" }
	| { type: "turn-failed"; message: string }
	| { type: "turn-cancelled" };
