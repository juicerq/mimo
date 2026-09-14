import { z } from "zod";
import { dataPath } from "../storage/home";
import { appendJsonLine, readTextFile } from "../storage/files";
import type { BotMode } from "../bot/types";

const ACTIONS_PATH = dataPath("actions.jsonl");

const actionSchema = z.object({
	at: z.string(),
	kind: z.enum(["send_email", "send_draft", "delete_routine", "delete_bot"]),
	mode: z.enum(["normal", "autonomous"]),
	botId: z.string(),
	account: z.string().nullable(),
	summary: z.string(),
	result: z.enum(["ok", "failed"]),
	detail: z.record(z.string(), z.string()),
	error: z.string().nullable(),
});

export type ActionRecord = z.infer<typeof actionSchema>;

export interface ActionInput {
	kind: ActionRecord["kind"];
	mode: BotMode;
	botId: string;
	account?: string;
	summary: string;
	detail?: Record<string, string>;
}

async function write(input: ActionInput, result: ActionRecord["result"], error: string | null): Promise<void> {
	await appendJsonLine(ACTIONS_PATH, {
		at: new Date().toISOString(),
		kind: input.kind,
		mode: input.mode,
		botId: input.botId,
		account: input.account ?? null,
		summary: input.summary,
		result,
		detail: input.detail ?? {},
		error,
	});
}

export async function recordAction(input: ActionInput): Promise<void> {
	await write(input, "ok", null);
}

export async function recordFailure(input: ActionInput, error: unknown): Promise<void> {
	await write(input, "failed", error instanceof Error ? error.message : String(error));
}

export async function listActions({ limit, botId }: { limit: number; botId: string }): Promise<ActionRecord[]> {
	const raw = await readTextFile(ACTIONS_PATH);
	if (raw === null) {
		return [];
	}
	const records: ActionRecord[] = [];
	for (const line of raw.split(/\r?\n/)) {
		if (line.trim() === "") {
			continue;
		}
		const parsed = actionSchema.safeParse(JSON.parse(line));
		if (parsed.success && parsed.data.botId === botId) {
			records.push(parsed.data);
		}
	}
	return records.slice(-limit).reverse();
}
