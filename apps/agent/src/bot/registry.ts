import { recordAction } from "../actions/actions";
import { removeWorktree, uncommittedWork } from "../computer/worktree";
import { deleteBotRoutines } from "../routines/routines";
import type { Bot } from "./bot";
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
		bots.push({ id: bot.botId, name: bot.info.name, busy: bot.busy, team: bot.team, waiting: bot.approval?.toolName ?? null, failed: bot.failed });
	}
	return bots;
}

async function guardWork(id: string, name: string, origin: DeleteOrigin, discard: boolean): Promise<void> {
	if (origin !== "tool" || discard) {
		return;
	}
	if (await uncommittedWork(id)) {
		throw new Error(`A frente ${name} tem trabalho sem commit na cópia isolada. Commite antes de fechar, ou peça de novo com discard para jogar fora.`);
	}
}

export async function deleteBot(id: string, origin: DeleteOrigin, discard = false): Promise<void> {
	const record = await readBot(id);
	if (record) {
		await guardWork(id, record.name, origin, discard);
	}
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
