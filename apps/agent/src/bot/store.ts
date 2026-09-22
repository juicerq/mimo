import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { initialModel, selectModel } from "../model/catalog";
import { ModelSelectionSchema, type ModelInfo } from "../model/types";
import { dataPath } from "../storage/home";
import { database } from "../storage/database";
import { bots } from "../storage/schema";
import { BotNameSchema, BotPromptSchema, type BotInfo } from "./types";

const LEGACY_PROVIDERS: Record<string, string> = { "openai-oauth": "openai-codex" };
const LEGACY_MODEL_IDS: Record<string, string> = { "deepseek-flash": "deepseek-v4-flash" };
const LEGACY_REASONING: Record<string, string> = { "provider-default": "medium", none: "off" };

const StoredBotSchema = z.object({
	id: z.uuid(),
	name: BotNameSchema,
	createdAt: z.iso.datetime(),
	model: z.looseObject({ provider: z.string(), id: z.string(), reasoning: z.string() }).optional(),
	prompt: BotPromptSchema.optional(),
});

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


export function legacyBot(value: unknown): BotInfo {
	const stored = StoredBotSchema.parse(value);
	return { ...stored, model: repairModel(stored.model) };
}

function botInfo(row: typeof bots.$inferSelect): BotInfo {
	return { id: row.id, name: row.name, createdAt: row.createdAt, model: repairModel({ provider: row.provider, id: row.modelId, reasoning: row.reasoning }), ...row.prompt && { prompt: row.prompt } };
}

export function botRow(bot: BotInfo): typeof bots.$inferInsert {
	return { id: bot.id, name: bot.name, createdAt: bot.createdAt, provider: bot.model.provider, modelId: bot.model.id, reasoning: bot.model.reasoning, prompt: bot.prompt ?? null };
}

export async function readBot(id: string): Promise<BotInfo | null> {
	const row = database().select().from(bots).where(eq(bots.id, id)).get();
	if (!row) {
		return null;
	}
	return botInfo(row);
}

export async function writeBot(bot: BotInfo): Promise<void> {
	database().update(bots).set(botRow(bot)).where(eq(bots.id, bot.id)).run();
}

export async function listBots(): Promise<BotInfo[]> {
	return database().select().from(bots).orderBy(bots.createdAt).all().map(botInfo);
}

export type BotDraft = Pick<BotInfo, "name"> & Partial<Pick<BotInfo, "model" | "prompt">>;

export async function createBot(draft: BotDraft): Promise<BotInfo> {
	const bot: BotInfo = { ...draft, id: randomUUID(), createdAt: new Date().toISOString(), model: draft.model ?? initialModel() };
	if ((await listBots()).some((existing) => existing.name.toLowerCase() === bot.name.toLowerCase())) {
		throw new Error(`Você já tem um bot chamado ${bot.name}.`);
	}
	database().insert(bots).values(botRow(bot)).run();
	return bot;
}

export async function removeBot(id: string): Promise<void> {
	database().delete(bots).where(eq(bots.id, id)).run();
	await rm(dataPath("bots", id, "images"), { recursive: true, force: true });
}
