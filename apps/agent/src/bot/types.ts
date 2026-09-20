import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import type { LoginSession, LoginTarget } from "../login/login";
import type { ModelInfo } from "../model/types";

const MESSAGE_ROLES = new Set(["user", "assistant", "toolResult"]);

function isMessage(value: unknown): boolean {
	if (typeof value !== "object" || value === null || !("role" in value)) {
		return false;
	}
	return typeof value.role === "string" && MESSAGE_ROLES.has(value.role);
}

export const MessageSchema = z.custom<AgentMessage>(isMessage, "Esta mensagem não tem um papel conhecido.");

const NAME_RULE = "Use um nome de 1 a 80 caracteres visíveis.";

export const BotNameSchema = z.string().trim().min(1, NAME_RULE).max(80, NAME_RULE).regex(/^[^\p{Cc}\p{Cf}]+$/u, NAME_RULE);
export const BotPromptSchema = z.string().trim().min(1).max(4_000);

export interface BotInfo {
	id: string;
	name: string;
	createdAt: string;
	model: ModelInfo;
	prompt?: string;
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

export type BotEvent =
	| { type: "user"; text: string }
	| { type: "queue"; items: readonly string[] }
	| { type: "summary"; text: string }
	| { type: "warning"; text: string }
	| { type: "routine"; name: string; prompt: string }
	| { type: "reply-delta"; delta: string }
	| { type: "reply"; text: string }
	| { type: "tool"; id: string; toolName: string; input: unknown }
	| { type: "asked"; id: string; peer: string; prompt: string }
	| { type: "answered"; peer: string; text: string; failed: boolean }
	| { type: "tool-result"; id: string; toolName: string; output: string }
	| { type: "tool-warned"; message: string }
	| { type: "tool-failed"; id: string; toolName: string; message: string }
	| { type: "approval"; approval: Approval }
	| { type: "login"; target: LoginTarget; session: LoginSession }
	| { type: "approval-resolved"; outcome: "approved" | "denied" }
	| { type: "usage"; contextTokens: number }
	| { type: "turn-started" }
	| { type: "turn-finished" }
	| { type: "turn-failed"; message: string }
	| { type: "turn-cancelled" };
