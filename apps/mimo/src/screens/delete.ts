import { listBots } from "@agent/bot/store";
import type { BotInfo } from "@agent/bot/types";
import { describeError } from "../errors";
import { choicePanel, type Panel, type PanelView } from "../panel";

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
		load: () => ({
			choices: [{ id: "delete", label: "Delete" }, { id: "cancel", label: "Cancel" }],
			notes: ["This erases the conversation, the memory and the routines of this bot."],
		}),
		pick: (choice, view) => {
			if (choice === "cancel") {
				view.close();
				return;
			}
			void erase(bot, remove, view);
		},
	});
}

async function erase(bot: BotInfo, remove: RemoveBot, view: PanelView): Promise<void> {
	view.state("saving");
	try {
		await remove(bot);
		view.close({ message: `Deleted "${bot.name}".`, list: true });
	} catch (error) {
		view.line(describeError(error), "error");
		view.state("ready");
	}
}
