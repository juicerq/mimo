import { recordAction } from "../actions/actions";
import type { Conversation } from "../conversation/conversation";
import type { LastMessage } from "../conversation/record";
import { readBot, removeBot, writeBot } from "./store";
import type { BotInfo } from "./types";

const open = new Map<string, Conversation>();
const opening = new Map<string, Promise<Conversation>>();
const deleting = new Set<string>();

export interface BotActivity {
	id: string;
	name: string;
	busy: boolean;
	waiting: string | null;
	failed: string | null;
	last: LastMessage | null;
}

export function mainChat(botId: string): Conversation | null {
	return open.get(botId) ?? null;
}

export async function openOnce(id: string, load: () => Promise<Conversation>): Promise<Conversation> {
	if (id.split(":").some((botId) => deleting.has(botId))) {
		throw new Error("Este bot está sendo apagado.");
	}
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
	if (deleting.has(id)) {
		throw new Error("Este bot já está sendo apagado.");
	}
	deleting.add(id);
	try {
		const record = await readBot(id);
		await Promise.allSettled([...opening].filter(([key]) => key.split(":").includes(id)).map(([, promise]) => promise));
		const chats = [...open].filter(([, chat]) => chat.botId === id || chat.chat.askedBy === id);
		await Promise.all(chats.map(async ([key, chat]) => {
			await chat.close();
			open.delete(key);
		}));
		await removeBot(id);
		if (record) {
			await recordAction({ kind: "delete_bot", botId: id, summary: record.name });
		}
	} finally {
		deleting.delete(id);
	}
}
