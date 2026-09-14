import type { BotInfo } from "@agent/bot/types";
import { CANCEL_HINT, type Panel } from "../panel";

export type SaveFolder = (folder: string | undefined) => Promise<BotInfo>;

export function folderPanel(bot: BotInfo, save: SaveFolder): Panel {
	return {
		heading: `${bot.name}  ·  folder`,
		placeholder: "absolute path, - to clear, or /cancel",
		start(view) {
			view.line(bot.folder ?? "none: the computer tools run from your home", "item", true);
			view.line("Type the folder this bot works in. Its team is born there too.", "note");
			view.line(CANCEL_HINT, "hint");
			view.state("ready");
		},
		submit(text, view) {
			view.saving(async () => {
				const saved = await save(text === "-" ? undefined : text);
				view.close({ bot: saved, message: saved.folder === undefined ? `"${saved.name}" works from your home again.` : `"${saved.name}" works in ${saved.folder}.` });
			});
		},
	};
}
