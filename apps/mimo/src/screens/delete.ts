import { listBots, listChildren } from "@agent/bot/store";
import type { BotInfo } from "@agent/bot/types";
import { choicePanel, type Panel } from "../panel";

export type RemoveBot = (bot: BotInfo) => Promise<void>;

export function deletePanel(remove: RemoveBot): Panel {
	let bots: BotInfo[] = [];

	return choicePanel({
		heading: "delete",
		empty: "No bot exists yet.",
		load: async () => {
			bots = await listBots();
			return { choices: bots.map((bot) => ({ id: bot.id, label: bot.name })) };
		},
		pick: (id, view) => {
			const bot = bots.find((candidate) => candidate.id === id);
			if (bot) {
				view.show(confirmPanel(bot, remove));
			}
		},
	});
}

function confirmPanel(bot: BotInfo, remove: RemoveBot): Panel {
	return choicePanel<"delete" | "cancel">({
		heading: `delete "${bot.name}"?`,
		load: async () => ({
			choices: [{ id: "delete", label: "Delete" }, { id: "cancel", label: "Cancel" }],
			notes: [
				"This erases the conversation, the memory and the routines of this bot.",
				...teamNote(await listChildren(bot.id)),
			],
		}),
		pick: (choice, view) => {
			if (choice === "cancel") {
				view.close();
				return;
			}
			view.saving(async () => {
				await remove(bot);
				view.close({ message: `Deleted "${bot.name}".`, list: true });
			});
		},
	});
}

function teamNote(children: BotInfo[]): string[] {
	if (children.length === 0) {
		return [];
	}
	return [`Its team goes too: ${children.map((child) => child.name).join(", ")}.`];
}
