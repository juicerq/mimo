import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { z } from "zod";
import { initialModel, selectModel } from "../model/catalog";
import { ModelSelectionSchema, type ModelInfo } from "../model/types";
import { dataPath } from "../storage/data";
import { readJsonFile, writeTextFile } from "../storage/files";
import { BotModeSchema, BotNameSchema, type BotInfo } from "./types";

const LEGACY_PROVIDERS: Record<string, string> = { "openai-oauth": "openai-codex" };
const LEGACY_MODEL_IDS: Record<string, string> = { "deepseek-flash": "deepseek-v4-flash" };
const LEGACY_REASONING: Record<string, string> = { "provider-default": "medium", none: "off" };

const StoredBotSchema = z.object({
	id: z.uuid(),
	name: BotNameSchema,
	createdAt: z.iso.datetime(),
	mode: BotModeSchema.default("normal"),
	model: z.looseObject({ provider: z.string(), id: z.string(), reasoning: z.string() }).optional(),
});

const TranscriptSchema = z.array(z.custom<AgentMessage>());

function botPath(id: string) {
	return dataPath("bots", `${id}.json`);
}

function repairModel(stored: z.infer<typeof StoredBotSchema>["model"]): ModelInfo {
	const selection = ModelSelectionSchema.safeParse(stored && {
		provider: LEGACY_PROVIDERS[stored.provider] ?? stored.provider,
		id: LEGACY_MODEL_IDS[stored.id] ?? stored.id,
		reasoning: LEGACY_REASONING[stored.reasoning] ?? stored.reasoning,
	});
	if (!selection.success) {
		return initialModel();
	}
	try {
		return selectModel(selection.data);
	} catch {
		return initialModel();
	}
}

export async function readBot(id: string): Promise<BotInfo | null> {
	const stored = await readJsonFile(botPath(id), StoredBotSchema);
	if (!stored) {
		return null;
	}
	return { ...stored, model: repairModel(stored.model) };
}

export async function writeBot(bot: BotInfo): Promise<void> {
	await writeTextFile(botPath(bot.id), `${JSON.stringify(bot, null, "\t")}\n`, 0o600);
}

export async function listBots(): Promise<BotInfo[]> {
	const entries = await readdir(dataPath("bots")).catch(missingAsEmpty);
	const bots = await Promise.all(entries
		.filter((entry) => entry.endsWith(".json"))
		.map(async (entry) => await readBot(entry.slice(0, -5))));
	return bots
		.filter((bot): bot is BotInfo => bot !== null)
		.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function createBot(name: string): Promise<BotInfo> {
	const bot: BotInfo = {
		id: randomUUID(),
		name,
		createdAt: new Date().toISOString(),
		model: initialModel(),
		mode: "normal",
	};
	await writeBot(bot);
	return bot;
}

export async function readTranscript(id: string): Promise<AgentMessage[]> {
	return await readJsonFile(dataPath("bots", id, "messages.json"), TranscriptSchema) ?? [];
}

export async function writeTranscript(id: string, messages: AgentMessage[]): Promise<void> {
	await writeTextFile(dataPath("bots", id, "messages.json"), JSON.stringify(messages), 0o600);
}

function missingAsEmpty(error: unknown): string[] {
	if (error instanceof Error && "code" in error && error.code === "ENOENT") {
		return [];
	}
	throw error;
}
