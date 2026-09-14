import { recordAction } from "../actions/actions";
import { removeWorktree } from "../computer/worktree";
import { deleteBotRoutines } from "../routines/routines";
import type { Bot } from "./bot";
import { listChildren, readBot, removeBot } from "./store";
import type { TeamMember } from "./types";

export type DeleteOrigin = "panel" | "tool" | "cascade";

const open = new Map<string, Bot>();

export interface BotActivity {
	id: string;
	name: string;
	team: TeamMember[];
	waiting: string | null;
	failed: string | null;
}

export function runningBot(id: string): Bot | null {
	return open.get(id) ?? null;
}

export function trackBot(bot: Bot): void {
	open.set(bot.botId, bot);
}

export function activity(): BotActivity[] {
	const bots: BotActivity[] = [];
	for (const bot of open.values()) {
		if (bot.parentId !== undefined) {
			continue;
		}
		bots.push({ id: bot.botId, name: bot.info.name, team: bot.team, waiting: bot.approval?.toolName ?? null, failed: bot.failed });
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
	await removeWorktree(id);
	await removeBot(id);
	if (record) {
		await recordAction({
			kind: "delete_bot",
			mode: record.mode,
			botId: record.parentId ?? id,
			summary: record.name,
			detail: { origin, bot: id },
		});
	}
}
