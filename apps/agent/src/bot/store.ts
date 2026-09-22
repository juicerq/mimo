import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { initialModel, selectModel } from "../model/catalog";
import { ModelSelectionSchema, type ModelInfo } from "../model/types";
import { dataPath } from "../storage/home";
import { database } from "../storage/database";
import { bots } from "../storage/schema";
import type { BotInfo } from "./types";

function repairModel(stored: { provider: string; id: string; reasoning: string }): ModelInfo {
	const selection = ModelSelectionSchema.safeParse(stored);
	if (!selection.success) {
		return initialModel();
	}
	try {
		return selectModel(selection.data);
	} catch {
		return initialModel();
	}
}

function botInfo(row: typeof bots.$inferSelect): BotInfo {
	return { id: row.id, name: row.name, createdAt: row.createdAt, model: repairModel({ provider: row.provider, id: row.modelId, reasoning: row.reasoning }), ...row.purpose && { purpose: row.purpose } };
}

function botRow(bot: BotInfo): typeof bots.$inferInsert {
	return { id: bot.id, name: bot.name, createdAt: bot.createdAt, provider: bot.model.provider, modelId: bot.model.id, reasoning: bot.model.reasoning, purpose: bot.purpose ?? null };
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

export type BotDraft = Pick<BotInfo, "name"> & Partial<Pick<BotInfo, "model" | "purpose">>;

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
