import { recordAction } from "../actions/actions";
import { deleteBotRoutines } from "../routines/routines";
import type { Bot } from "./bot";
import type { LastMessage } from "./events";
import { listChildren, readBot, removeBot } from "./store";
import type { TeamMember } from "./types";

export type DeleteOrigin = "panel" | "tool" | "cascade";

const open = new Map<string, Bot>();
const opening = new Map<string, Promise<Bot>>();

export interface BotActivity {
	id: string;
	name: string;
	busy: boolean;
	team: TeamMember[];
	waiting: string | null;
	failed: string | null;
	last: LastMessage | null;
}

export function runningBot(id: string): Bot | null {
	return open.get(id) ?? null;
}

export async function openOnce(id: string, load: () => Promise<Bot>): Promise<Bot> {
	const running = open.get(id);
	if (running) {
		return running;
	}
	const pending = opening.get(id) ?? load()
		.then((bot) => {
			open.set(id, bot);
			return bot;
		})
		.finally(() => opening.delete(id));
	opening.set(id, pending);
	return await pending;
}

export function activity(): BotActivity[] {
	const bots: BotActivity[] = [];
	for (const bot of open.values()) {
		if (bot.parentId !== undefined) {
			continue;
		}
		bots.push({ id: bot.botId, name: bot.info.name, busy: bot.busy, team: bot.team, waiting: bot.approval?.toolName ?? null, failed: bot.failed, last: bot.lastMessage });
	}
	return bots;
}

export async function deleteBot(id: string, origin: DeleteOrigin): Promise<void> {
	const record = await readBot(id);
	for (const child of await listChildren(id)) {
		await deleteBot(child.id, "cascade");
	}
	const running = open.get(id);
	running?.cancel();
	open.delete(id);
	await deleteBotRoutines(id);
	await removeBot(id);
	if (record) {
		await recordAction({
			kind: "delete_bot",
			botId: record.parentId ?? id,
			summary: record.name,
			detail: { origin, bot: id },
		});
	}
}
