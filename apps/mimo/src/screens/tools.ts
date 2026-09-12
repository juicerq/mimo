import { TOOL_GROUPS, type BotInfo, type ToolGroup } from "@agent/bot/types";
import { choicePanel, type Panel } from "../panel";

export type SaveTools = (tools: ToolGroup[]) => Promise<BotInfo>;

export function toolsPanel(bot: BotInfo, save: SaveTools): Panel {
	return choicePanel<ToolGroup>({
		heading: `${bot.name}  ·  tools`,
		load: () => ({
			choices: TOOL_GROUPS.map((group) => ({ id: group, label: `${bot.tools.includes(group) ? "[x]" : "[ ]"} ${group}` })),
			notes: ["Choose a number to turn a group on or off. A group that is off also leaves the prompt."],
		}),
		pick: (group, view) => {
			view.saving(async () => {
				view.show(toolsPanel(await save(toggle(bot.tools, group)), save));
			});
		},
	});
}

function toggle(tools: ToolGroup[], group: ToolGroup): ToolGroup[] {
	return TOOL_GROUPS.filter((item) => (item === group) !== tools.includes(item));
}
