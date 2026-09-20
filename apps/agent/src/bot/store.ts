import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { z } from "zod";
import { initialModel, selectModel } from "../model/catalog";
import { ModelSelectionSchema, type ModelInfo } from "../model/types";
import { dataPath } from "../storage/home";
import { readJsonFile, writeTextFile } from "../storage/files";
import { BotNameSchema, BotPromptSchema, MessageSchema, type BotInfo, type ChatKey } from "./types";

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

const ChildSchema = z.looseObject({ id: z.uuid(), parentId: z.uuid() });

const TranscriptSchema = z.array(MessageSchema);

function botPath(id: string) {
	return dataPath("bots", `${id}.json`);
}

function transcriptPath(chat: ChatKey): string {
	if (chat.askedBy) {
		return dataPath("bots", chat.botId, "peers", `${chat.askedBy}.json`);
	}
	return dataPath("bots", chat.botId, "messages.json");
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

async function botIds(): Promise<string[]> {
	const entries = await readdir(dataPath("bots")).catch(missingAsEmpty);
	return entries.filter((entry) => entry.endsWith(".json")).map((entry) => entry.slice(0, -5));
}

export async function listBots(): Promise<BotInfo[]> {
	const bots = await Promise.all((await botIds()).map(async (id) => await readBot(id)));
	return bots
		.filter((bot): bot is BotInfo => bot !== null)
		.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function childBotIds(): Promise<string[]> {
	const children = await Promise.all((await botIds()).map(async (id) => await readJsonFile(botPath(id), ChildSchema).catch(() => null)));
	return children.filter((child) => child !== null).map((child) => child.id);
}

export type BotDraft = Pick<BotInfo, "name"> & Partial<Pick<BotInfo, "model" | "prompt">>;

export async function createBot(draft: BotDraft): Promise<BotInfo> {
	const taken = (await listBots()).some((bot) => bot.name.toLowerCase() === draft.name.toLowerCase());
	if (taken) {
		throw new Error(`Você já tem um bot chamado ${draft.name}.`);
	}
	const bot: BotInfo = {
		...draft,
		id: randomUUID(),
		createdAt: new Date().toISOString(),
		model: draft.model ?? initialModel(),
	};
	await writeBot(bot);
	return bot;
}

export async function removeBot(id: string): Promise<void> {
	await rm(dataPath("bots", id), { recursive: true, force: true });
	await rm(botPath(id), { force: true });
	await Promise.all((await botIds()).map(async (other) => await rm(transcriptPath({ botId: other, askedBy: id }), { force: true })));
}

export async function readTranscript(chat: ChatKey): Promise<AgentMessage[]> {
	const path = transcriptPath(chat);
	const stored = await readJsonFile(path, TranscriptSchema).catch((error: unknown) => {
		if (error instanceof z.ZodError || error instanceof SyntaxError) {
			throw new Error(`A conversa gravada está estragada e não foi tocada: ${path}`);
		}
		throw error;
	});
	return stored ?? [];
}

export async function writeTranscript(chat: ChatKey, messages: AgentMessage[]): Promise<void> {
	await writeTextFile(transcriptPath(chat), JSON.stringify(messages), 0o600);
}

function missingAsEmpty(error: unknown): string[] {
	if (error instanceof Error && "code" in error && error.code === "ENOENT") {
		return [];
	}
	throw error;
}
