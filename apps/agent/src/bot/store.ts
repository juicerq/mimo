import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { z } from "zod";
import { initialModel, selectModel } from "../model/catalog";
import { ModelSelectionSchema, type ModelInfo } from "../model/types";
import { dataPath } from "../storage/home";
import { readJsonFile, writeTextFile } from "../storage/files";
import { BotModeSchema, BotNameSchema, BotPromptSchema, CHILD_GROUPS, TOOL_GROUPS, MessageSchema, ToolGroupSchema, type BotInfo, type ToolGroup } from "./types";

const VERSION = 1;
const LEGACY_PROVIDERS: Record<string, string> = { "openai-oauth": "openai-codex" };
const LEGACY_MODEL_IDS: Record<string, string> = { "deepseek-flash": "deepseek-v4-flash" };
const LEGACY_REASONING: Record<string, string> = { "provider-default": "medium", none: "off" };

const StoredBotSchema = z.object({
	id: z.uuid(),
	name: BotNameSchema,
	createdAt: z.iso.datetime(),
	mode: BotModeSchema.default("autonomous"),
	model: z.looseObject({ provider: z.string(), id: z.string(), reasoning: z.string() }).optional(),
	tools: z.array(ToolGroupSchema).default([...TOOL_GROUPS]),
	parentId: z.uuid().optional(),
	prompt: BotPromptSchema.optional(),
	folder: z.string().optional(),
	branch: z.string().optional(),
	version: z.number().optional(),
});

const TranscriptSchema = z.array(MessageSchema);

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

function repairTools(stored: z.infer<typeof StoredBotSchema>): ToolGroup[] {
	if (stored.parentId !== undefined) {
		return stored.tools.filter((group) => group !== "team");
	}
	if (stored.version === VERSION) {
		return stored.tools;
	}
	return TOOL_GROUPS.filter((group) => group === "team" || stored.tools.includes(group));
}

export async function readBot(id: string): Promise<BotInfo | null> {
	const stored = await readJsonFile(botPath(id), StoredBotSchema);
	if (!stored) {
		return null;
	}
	const { version, ...rest } = stored;
	const bot: BotInfo = { ...rest, model: repairModel(stored.model), tools: repairTools(stored) };
	if (version !== VERSION) {
		await writeBot(bot);
	}
	return bot;
}

export async function writeBot(bot: BotInfo): Promise<void> {
	await writeTextFile(botPath(bot.id), `${JSON.stringify({ ...bot, version: VERSION }, null, "\t")}\n`, 0o600);
}

async function readAll(): Promise<BotInfo[]> {
	const entries = await readdir(dataPath("bots")).catch(missingAsEmpty);
	const bots = await Promise.all(entries
		.filter((entry) => entry.endsWith(".json"))
		.map(async (entry) => await readBot(entry.slice(0, -5))));
	return bots
		.filter((bot): bot is BotInfo => bot !== null)
		.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function listBots(): Promise<BotInfo[]> {
	return (await readAll()).filter((bot) => bot.parentId === undefined);
}

export async function listChildren(parentId: string): Promise<BotInfo[]> {
	return (await readAll()).filter((bot) => bot.parentId === parentId);
}

export type BotPatch = Partial<Pick<BotInfo, "name" | "prompt" | "tools" | "model">>;
export type BotDraft = Pick<BotInfo, "name"> & Partial<Pick<BotInfo, "model" | "tools" | "parentId" | "prompt" | "folder">>;

function defaultTools(parentId: string | undefined): ToolGroup[] {
	if (parentId === undefined) {
		return [...TOOL_GROUPS];
	}
	return [...CHILD_GROUPS];
}

export async function createBot(draft: BotDraft): Promise<BotInfo> {
	let model = draft.model;
	if (!model && draft.parentId !== undefined) {
		model = (await readBot(draft.parentId))?.model;
	}
	const bot: BotInfo = {
		...draft,
		id: randomUUID(),
		createdAt: new Date().toISOString(),
		mode: "autonomous",
		model: model ?? initialModel(),
		tools: draft.tools ?? defaultTools(draft.parentId),
	};
	await writeBot(bot);
	return bot;
}

export async function removeBot(id: string): Promise<void> {
	await rm(dataPath("bots", id), { recursive: true, force: true });
	await rm(botPath(id), { force: true });
}

export async function readTranscript(id: string): Promise<AgentMessage[]> {
	const path = dataPath("bots", id, "messages.json");
	const stored = await readJsonFile(path, TranscriptSchema).catch((error: unknown) => {
		if (error instanceof z.ZodError || error instanceof SyntaxError) {
			throw new Error(`A conversa gravada está estragada e não foi tocada: ${path}`);
		}
		throw error;
	});
	return stored ?? [];
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
