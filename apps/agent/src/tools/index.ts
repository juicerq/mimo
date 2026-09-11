import type { AgentTool } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import { actionTools } from "../actions/tools";
import { BotModeSchema } from "../bot/types";
import { computerTools } from "../computer/tools";
import { gmailTools } from "../gmail/tools";
import { historyTools } from "../history/tools";
import { memoryTools } from "../memory/tools";
import { routineTools } from "../routines/tools";
import { teamTools } from "../team/tools";
import { webTools } from "../web/tools";
import type { ToolContext } from "./context";
import { tool } from "./tool";

const APPROVAL_TOOLS = new Set([
	"send_email",
	"send_draft",
	"delete_routine",
	"disconnect_gmail",
	"delete_bot",
	"bash",
	"write",
	"edit",
]);
const SetModeInput = z.object({ mode: BotModeSchema.describe("Modo desejado.") });

const currentTime = tool({
	name: "current_time",
	description: "Retorna a data e a hora atuais.",
	input: z.object({}),
	async execute() {
		return { now: new Date().toISOString() };
	},
});

function setMode(context: ToolContext): AgentTool {
	return tool({
		name: "set_mode",
		description:
			"Alterna o modo do bot nesta conversa. No normal, os envios pedem aprovação no terminal; no autônomo, enviam sem perguntar e ficam registrados. Use só a pedido explícito do usuário.",
		input: SetModeInput,
		async execute({ mode }) {
			const previous = context.mode;
			context.setMode(mode);
			return { previous, mode };
		},
	});
}

export function botTools(context: ToolContext): AgentTool[] {
	const groups = new Set(context.tools);

	return [
		currentTime,
		...memoryTools(context),
		...historyTools(context),
		...actionTools(context),
		...groups.has("gmail") ? gmailTools(context) : [],
		...groups.has("routines") ? routineTools(context) : [],
		...groups.has("web") ? webTools() : [],
		...groups.has("computer") ? computerTools() : [],
		...context.parentId === undefined ? [setMode(context), ...teamTools(context)] : [],
	];
}

export function needsApproval(context: ToolContext, toolName: string, args: unknown): boolean {
	if (toolName === "set_mode") {
		const input = SetModeInput.safeParse(args);
		return input.success && input.data.mode === "autonomous" && context.mode === "normal";
	}
	return context.mode === "normal" && APPROVAL_TOOLS.has(toolName);
}
