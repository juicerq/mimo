import type { AgentTool } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import { actionTools } from "../actions/tools";
import { BotModeSchema, ToolGroupSchema } from "../bot/types";
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
const SetToolsInput = z.object({
	tools: z.array(ToolGroupSchema).describe("Os grupos que ficam ligados. A lista substitui a atual."),
});

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

function setTools(context: ToolContext): AgentTool {
	return tool({
		name: "set_tools",
		description:
			"Liga e desliga grupos de tools deste bot. Desligar um grupo também tira as instruções dele do contexto. Use só a pedido explícito do usuário.",
		input: SetToolsInput,
		async execute({ tools }) {
			const previous = context.tools;
			await context.setTools(tools);
			return { previous, tools };
		},
	});
}

export function botInstructions(context: ToolContext): string {
	const groups = new Set(context.tools);

	return [
		instructions,
		...groups.has("gmail") ? [gmailInstructions] : [],
		...groups.has("routines") ? [routineInstructions] : [],
		...groups.has("computer") ? [computerInstructions()] : [],
		...groups.has("team") ? [teamInstructions] : [],
	].join("\n\n");
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
		...groups.has("team") ? teamTools(context) : [],
		...context.parentId === undefined ? [setMode(context), setTools(context)] : [],
	];
}

export function needsApproval(context: ToolContext, toolName: string, args: unknown): boolean {
	if (toolName === "set_mode") {
		const input = SetModeInput.safeParse(args);
		return input.success && input.data.mode === "autonomous" && context.mode === "normal";
	}
	if (toolName === "set_tools") {
		const input = SetToolsInput.safeParse(args);
		return input.success && context.mode === "normal" && input.data.tools.some((group) => !context.tools.includes(group));
	}
	return context.mode === "normal" && APPROVAL_TOOLS.has(toolName);
}
