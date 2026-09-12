import { TOOL_GROUPS, type BotInfo, type ToolGroup } from "@agent/bot/types";
import { describeError } from "../errors";
import { choicePanel, type Panel, type PanelView } from "../panel";

export type SaveTools = (tools: ToolGroup[]) => Promise<BotInfo>;

export function toolsPanel(bot: BotInfo, save: SaveTools): Panel {
	return choicePanel<ToolGroup>({
		heading: `${bot.name}  ·  tools`,
		load: () => ({
			choices: TOOL_GROUPS.map((group) => ({ id: group, label: `${bot.tools.includes(group) ? "[x]" : "[ ]"} ${group}` })),
			notes: ["Choose a number to turn a group on or off. A group that is off also leaves the prompt."],
		}),
		pick: (group, view) => {
			void store(toggle(bot.tools, group), save, view);
		},
	});
}

function toggle(tools: ToolGroup[], group: ToolGroup): ToolGroup[] {
	return TOOL_GROUPS.filter((item) => (item === group) !== tools.includes(item));
}

async function store(tools: ToolGroup[], save: SaveTools, view: PanelView): Promise<void> {
	view.state("saving");
	try {
		view.show(toolsPanel(await save(tools), save));
	} catch (error) {
		view.line(describeError(error), "error");
		view.state("ready");
	}
}
