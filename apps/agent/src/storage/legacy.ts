import { readdir } from "node:fs/promises";
import { z } from "zod";
import { botRow, legacyBot } from "../bot/store";
import { MessageSchema, type ChatKey } from "../bot/types";
import { callEvent, entryEvent, entryOf, resultEvent, usageEvent } from "../bot/events";
import { contentText } from "../messages";
import { spokenText } from "../speech/tools";
import { appendMessage, appendRecord, conversationId } from "../conversation/record";
import { dataPath } from "./home";
import { readTextFile } from "./files";
import { database, type Store } from "./database";
import { actions, bots, conversations, imports, memories, routines } from "./schema";
import { LegacyRoutineSchema } from "../routines/routines";

const IMPORT = "json-v1";
const Sent = z.object({ sent: z.literal(true) });
const Action = z.object({ at: z.string(), kind: z.string(), botId: z.string(), account: z.string().nullable(), summary: z.string(), result: z.enum(["ok", "failed"]), detail: z.record(z.string(), z.string()), error: z.string().nullable() });

async function files(path: string): Promise<string[]> {
	return await readdir(path).catch((error: unknown) => {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	});
}

async function json(path: string): Promise<unknown> {
	const text = await readTextFile(path);
	if (text === null) {
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`O arquivo antigo está inválido e foi preservado: ${path}`);
	}
}

async function transcript(chat: ChatKey) {
	const path = chat.askedBy ? dataPath("bots", chat.botId, "peers", `${chat.askedBy}.json`) : dataPath("bots", chat.botId, "messages.json");
	return { chat, messages: z.array(MessageSchema).parse(await json(path) ?? []) };
}

function importTranscript(db: Store, source: Awaited<ReturnType<typeof transcript>>): void {
	const id = conversationId(source.chat);
	db.insert(conversations).values({ id, botId: source.chat.botId, askedBy: source.chat.askedBy }).run();
	const calls = new Map<string, { id: string; name: string; arguments: unknown }>();
	for (const [index, message] of source.messages.entries()) {
		const identity = message.role === "toolResult" ? calls.get(message.toolCallId)?.id : undefined;
		appendMessage(db, id, message, identity ? `result:${identity}` : `legacy:${index}`);
		const events = [];
		if (message.role === "user") {
			events.push(entryEvent(entryOf(contentText(message.content))));
		} else if (message.role === "assistant") {
			for (const [part, call] of message.content.entries()) {
				if (call.type === "toolCall") {
					calls.set(call.id, { ...call, id: `legacy:${index}:${part}` });
				}
			}
			events.push(...message.content.flatMap((call, part) => call.type === "toolCall" ? [callEvent(call.name, `legacy:${index}:${part}`, call.arguments)] : []).filter((event) => event !== null), ...usageEvent(message.usage));
		} else if (message.role === "toolResult") {
			const call = calls.get(message.toolCallId);
			events.push(...legacyResult(message, call));
			calls.delete(message.toolCallId);
		}
		for (const [part, event] of events.entries()) {
			if (event.type !== "login") {
				appendRecord(db, { conversationId: id, id: `legacy:${index}:${part}`, at: message.timestamp, event });
			}
		}
	}
}

function legacyResult(message: Extract<z.infer<typeof MessageSchema>, { role: "toolResult" }>, call?: { id: string; name: string; arguments: unknown }) {
	const said = call ? spokenText(call.name, call.arguments) : null;
	const output = contentText(message.content);
	if (said !== null && !message.isError && Sent.safeParse(parseOutput(output)).success) {
		return [{ type: "reply" as const, text: said }];
	}
	return resultEvent({ id: call?.id ?? message.toolCallId, toolName: message.toolName }, output, message.isError);
}

function parseOutput(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

export async function importLegacy(): Promise<void> {
	const db = database();
	if (db.select().from(imports).all().some((row) => row.name === IMPORT)) {
		return;
	}
	const oldBots = await Promise.all((await files(dataPath("bots"))).filter((name) => name.endsWith(".json")).map(async (name) => legacyBot(await json(dataPath("bots", name)))));
	const ids = new Set(oldBots.map((bot) => bot.id));
	const logs = await Promise.all(oldBots.flatMap((bot) => [transcript({ botId: bot.id }), files(dataPath("bots", bot.id, "peers")).then(async (peers) => await Promise.all(peers.filter((name) => name.endsWith(".json") && ids.has(name.slice(0, -5))).map(async (name) => await transcript({ botId: bot.id, askedBy: name.slice(0, -5) }))))]));
	const oldMemories = await Promise.all(oldBots.map(async (bot) => ({ botId: bot.id, text: await readTextFile(dataPath("bots", bot.id, "memory.md")) })));
	const oldRoutines = z.object({ routines: z.array(LegacyRoutineSchema) }).parse(await json(dataPath("routines.json")) ?? { routines: [] }).routines;
	const oldActions = (await readTextFile(dataPath("actions.jsonl")))?.split("\n").filter(Boolean).map((line) => Action.parse(JSON.parse(line))) ?? [];
	db.transaction((tx) => {
		for (const bot of oldBots) {
			tx.insert(bots).values(botRow(bot)).run();
		}
		for (const log of logs.flat()) {
			importTranscript(tx, log);
		}
		for (const memory of oldMemories) {
			for (const line of memory.text?.split("\n").filter(Boolean) ?? []) {
				const match = /^(\d+): (.+)$/.exec(line);
				if (!match) {
					throw new Error(`A memória antiga de ${memory.botId} está inválida e foi preservada.`);
				}
				tx.insert(memories).values({ botId: memory.botId, position: Number(match[1]), text: match[2] }).run();
			}
		}
		for (const [index, routine] of oldRoutines.entries()) {
			tx.insert(routines).values({ ...routine, name: routine.name ?? `rotina-${index + 1}` }).run();
		}
		for (const action of oldActions) {
			tx.insert(actions).values(action).run();
		}
		tx.insert(imports).values({ name: IMPORT }).run();
	});
}
