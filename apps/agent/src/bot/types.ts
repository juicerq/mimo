import { z } from "zod";
import type { LoginSession, LoginTarget } from "../login/login";
import type { ModelInfo } from "../model/types";

export const BotNameSchema = z.string().trim().min(1).max(80).regex(/^[^\p{Cc}\p{Cf}]+$/u);
export const BotModeSchema = z.enum(["normal", "autonomous"]);

export type BotMode = z.infer<typeof BotModeSchema>;

export interface BotInfo {
	id: string;
	name: string;
	createdAt: string;
	model: ModelInfo;
	mode: BotMode;
}

export interface Approval {
	id: string;
	toolName: string;
	input: unknown;
}

export type BotEvent =
	| { type: "user"; text: string }
	| { type: "reply-delta"; delta: string }
	| { type: "reply"; text: string }
	| { type: "tool"; toolName: string }
	| { type: "tool-failed"; message: string }
	| { type: "approval"; approval: Approval }
	| { type: "login"; target: LoginTarget; session: LoginSession }
	| { type: "approval-resolved"; outcome: "approved" | "denied" }
	| { type: "usage"; contextTokens: number }
	| { type: "mode"; mode: BotMode }
	| { type: "turn-started" }
	| { type: "turn-finished" }
	| { type: "turn-failed"; message: string }
	| { type: "turn-cancelled" };
