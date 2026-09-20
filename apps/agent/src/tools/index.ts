import type { AgentTool } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import { computerInstructions, computerTools } from "../computer/tools";
import { gmailTools } from "../gmail/tools";
import { historyTools } from "../history/tools";
import { memoryTools } from "../memory/tools";
import { routineTools } from "../routines/tools";
import { teamTools } from "../team/tools";
import { webTools } from "../web/tools";
import type { ToolContext } from "./context";
import { tool } from "./tool";
import instructions from "../instructions.md" with { type: "text" };
import gmailInstructions from "../gmail/instructions.md" with { type: "text" };
import routineInstructions from "../routines/instructions.md" with { type: "text" };
import teamInstructions from "../team/instructions.md" with { type: "text" };

const currentTime = tool({
	name: "current_time",
	description: "Retorna a data e a hora atuais.",
	input: z.object({}),
	async execute() {
		return { now: new Date().toISOString() };
	},
});

export function botInstructions(context: ToolContext): string {
	return [
		instructions,
		gmailInstructions,
		routineInstructions,
		computerInstructions(),
		...context.parentId === undefined ? [teamInstructions] : [],
	].join("\n\n");
}

export function botTools(context: ToolContext): AgentTool[] {
	return [
		currentTime,
		...memoryTools(context),
		...historyTools(context),
		...gmailTools(context),
		...routineTools(context),
		...webTools(),
		...computerTools(),
		...context.parentId === undefined ? teamTools(context) : [],
	];
}
