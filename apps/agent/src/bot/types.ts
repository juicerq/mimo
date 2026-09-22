import { z } from "zod";
import type { LoginSession, LoginTarget } from "../login/login";
import type { ModelInfo } from "../model/types";

const NAME_RULE = "Use um nome de 1 a 80 caracteres visíveis.";

export const BotNameSchema = z.string().trim().min(1, NAME_RULE).max(80, NAME_RULE).regex(/^[^\p{Cc}\p{Cf}]+$/u, NAME_RULE);
export const BotPurposeSchema = z.string().trim().min(1).max(4_000);

export interface BotInfo {
	id: string;
	name: string;
	createdAt: string;
	model: ModelInfo;
	purpose?: string;
}

export interface ChatKey {
	botId: string;
	askedBy?: string;
}

export interface Approval {
	id: string;
	bot: string;
	toolName: string;
	input: unknown;
}

export interface Ask {
	bot: string;
	prompt: string;
	wait: boolean;
}

export type AskResult = { bot: string; reply: string } | { bot: string; status: string };

export type Interruption = "user" | "message" | "closed";

export type BotEvent =
	| { type: "user"; text: string; images: readonly string[] }
	| { type: "summary"; text: string }
	| { type: "warning"; text: string }
	| { type: "routine"; name: string; prompt: string }
	| { type: "reply"; text: string }
	| { type: "tool"; id: string; toolName: string; input: unknown }
	| { type: "asked"; id: string; peer: string; prompt: string }
	| { type: "answered"; peer: string; text: string; failed: boolean }
	| { type: "tool-result"; id: string; toolName: string; output: string }
	| { type: "tool-warned"; message: string }
	| { type: "tool-failed"; id: string; toolName: string; message: string }
	| { type: "approval"; approval: Approval }
	| { type: "login"; target: LoginTarget; session: LoginSession }
	| { type: "approval-resolved"; id: string; outcome: "approved" | "denied" }
	| { type: "usage"; contextTokens: number }
	| { type: "turn-started" }
	| { type: "turn-finished" }
	| { type: "turn-failed"; message: string }
	| { type: "turn-cancelled"; reason: Interruption };
