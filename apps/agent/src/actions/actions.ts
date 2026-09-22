import { database } from "../storage/database";
import { actions } from "../storage/schema";

export interface ActionInput {
	kind: "send_email" | "delete_routine" | "delete_bot";
	botId: string;
	account?: string;
	summary: string;
	detail?: Record<string, string>;
}

async function write(input: ActionInput, result: "ok" | "failed", error: string | null): Promise<void> {
	database().insert(actions).values({
		at: new Date().toISOString(),
		kind: input.kind,
		botId: input.botId,
		account: input.account ?? null,
		summary: input.summary,
		result,
		detail: input.detail ?? {},
		error,
	}).run();
}

export async function recordAction(input: ActionInput): Promise<void> {
	await write(input, "ok", null);
}

export async function recordFailure(input: ActionInput, error: unknown): Promise<void> {
	await write(input, "failed", error instanceof Error ? error.message : String(error));
}
