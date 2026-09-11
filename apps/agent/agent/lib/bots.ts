import { randomUUID } from "node:crypto";
import { defineState } from "eve/context";
import { readdir } from "node:fs/promises";
import { z } from "zod";
import { BotSchema, type Bot } from "../bots";
import { initialModel } from "../model";
import { dataPath } from "./data";
import { readJsonFile, writeTextFile } from "./files";
import { listSessionArchives } from "./session-history";

const BOTS_DIR = dataPath("bots");
const StoredBotSchema = BotSchema.partial({ model: true });
let queue: Promise<unknown> = Promise.resolve();

export const sessionBotId = defineState<string | null>("mimo.bot-id", () => null);

export function currentBotId() {
	const id = sessionBotId.get();
	if (!id) {
		throw new Error("This session is not linked to a bot.");
	}
	return id;
}

export async function findSessionBot(sessionId: string) {
	const entries = await readdir(BOTS_DIR).catch((error: unknown) => {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	});
	for (const name of entries.filter((entry) => entry.endsWith(".json"))) {
		const bot = await readJsonFile(dataPath("bots", name), StoredBotSchema);
		if (!bot) {
			continue;
		}
		if ([bot.sessionId, bot.previousSessionId, bot.memorySessionId].includes(sessionId)
			|| (await listSessionArchives(bot.id)).includes(sessionId)) {
			return bot.id;
		}
	}
	return null;
}

export async function listBots() {
	const entries = await readdir(BOTS_DIR).catch((error: unknown) => {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	});
	const bots = await Promise.all(entries.filter((name) => name.endsWith(".json")).map(async (name) => {
		const bot = await getBot(name.slice(0, -5));
		if (!bot) {
			throw new Error(`Bot file disappeared: ${name}`);
		}
		return bot;
	}));
	return bots.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function createBot(name: string) {
	const bot: Bot = { id: randomUUID(), name, sessionId: null, previousSessionId: null, memorySessionId: null, createdAt: new Date().toISOString(), model: await initialModel() };
	await saveBot(bot);
	return bot;
}

export async function getBot(id: string) {
	const stored = await readJsonFile(dataPath("bots", `${id}.json`), StoredBotSchema);
	if (!stored) {
		return null;
	}
	if (stored.model) {
		return { ...stored, model: stored.model };
	}
	return await updateBot(id, async (bot) => bot);
}

export async function updateBot(id: string, update: (bot: Bot) => Promise<Bot>) {
	const result = queue.then(async () => {
		const stored = await readJsonFile(dataPath("bots", `${id}.json`), StoredBotSchema);
		if (!stored) {
			return null;
		}
		const bot = { ...stored, model: stored.model ?? await initialModel() };
		if (!stored.model) {
			await saveBot(bot);
		}
		const updated = await update(bot);
		await saveBot(updated);
		return updated;
	});
	queue = result.catch(() => {});
	return await result;
}

export function botIdFromToken(continuationToken?: string) {
	return z.uuid().parse(continuationToken?.replace(/^bots:/, ""));
}

export async function saveBot(bot: Bot) {
	await writeTextFile(dataPath("bots", `${bot.id}.json`), `${JSON.stringify(bot, null, "\t")}\n`, 0o600);
}
