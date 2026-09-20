import { recordAction } from "../actions/actions";
import { deleteBotRoutines } from "../routines/routines";
import type { Chat } from "./chat";
import type { LastMessage } from "./events";
import { childBotIds, readBot, removeBot, writeBot } from "./store";
import type { BotInfo, ChatKey } from "./types";

const open = new Map<string, Chat>();
const opening = new Map<string, Promise<Chat>>();

export interface BotActivity {
	id: string;
	name: string;
	busy: boolean;
	waiting: string | null;
	failed: string | null;
	last: LastMessage | null;
}

export function chatId(chat: ChatKey): string {
	if (chat.askedBy) {
		return `${chat.botId}:${chat.askedBy}`;
	}
	return chat.botId;
}

export function mainChat(botId: string): Chat | null {
	return open.get(botId) ?? null;
}

export async function openOnce(id: string, load: () => Promise<Chat>): Promise<Chat> {
	const running = open.get(id);
	if (running) {
		return running;
	}
	const pending = opening.get(id) ?? load()
		.then((chat) => {
			open.set(id, chat);
			return chat;
		})
		.finally(() => opening.delete(id));
	opening.set(id, pending);
	return await pending;
}

export function activity(): BotActivity[] {
	const bots = new Map<string, BotActivity>();
	for (const chat of open.values()) {
		const entry = bots.get(chat.botId) ?? { id: chat.botId, name: chat.info.name, busy: false, waiting: null, failed: null, last: null };
		entry.busy ||= chat.busy;
		if (chat.withPerson) {
			entry.waiting = chat.approval?.toolName ?? null;
			entry.failed = chat.failed;
			entry.last = chat.lastMessage;
		}
		bots.set(chat.botId, entry);
	}
	return [...bots.values()];
}

export async function updateBot(id: string, patch: Partial<BotInfo>): Promise<BotInfo> {
	const record = await readBot(id);
	if (!record) {
		throw new Error("Este bot não existe mais.");
	}
	const updated = { ...record, ...patch };
	await writeBot(updated);
	for (const chat of open.values()) {
		if (chat.botId === id) {
			chat.adopt(updated);
		}
	}
	return updated;
}

export async function deleteBot(id: string): Promise<void> {
	const record = await readBot(id);
	forget(id);
	await deleteBotRoutines(id);
	await removeBot(id);
	if (record) {
		await recordAction({ kind: "delete_bot", botId: id, summary: record.name });
	}
}

export async function dropLegacyChildren(): Promise<void> {
	for (const id of await childBotIds()) {
		forget(id);
		await deleteBotRoutines(id);
		await removeBot(id);
	}
}

function forget(botId: string): void {
	for (const [id, chat] of open) {
		if (chat.botId === botId) {
			chat.cancel();
			open.delete(id);
		}
	}
}
