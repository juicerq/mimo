import type { AgentTool } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import { actionTools } from "../actions/tools";
import { BotModeSchema } from "../bot/types";
import { gmailTools } from "../gmail/tools";
import { historyTools } from "../history/tools";
import { memoryTools } from "../memory/tools";
import { routineTools } from "../routines/tools";
import { webTools } from "../web/tools";
import type { ToolContext } from "./context";
import { tool } from "./tool";

const APPROVAL_TOOLS = new Set(["send_email", "send_draft", "delete_routine", "disconnect_gmail"]);
const SetModeInput = z.object({ mode: BotModeSchema.describe("Modo desejado.") });

export function botTools(context: ToolContext): AgentTool[] {
	return [
		tool({
			name: "current_time",
			description: "Retorna a data e a hora atuais.",
			input: z.object({}),
			async execute() {
				return { now: new Date().toISOString() };
			},
		}),
		tool({
			name: "set_mode",
			description:
				"Alterna o modo do bot nesta conversa. No normal, os envios pedem aprovação no terminal; no autônomo, enviam sem perguntar e ficam registrados. Use só a pedido explícito do usuário.",
			input: SetModeInput,
			async execute({ mode }) {
				const previous = context.mode;
				context.setMode(mode);
				return { previous, mode };
			},
		}),
		...memoryTools(context),
		...gmailTools(context),
		...routineTools(context),
		...historyTools(context),
		...actionTools(context),
		...webTools(),
	];
}

export function needsApproval(context: ToolContext, toolName: string, args: unknown): boolean {
	if (toolName === "set_mode") {
		const input = SetModeInput.safeParse(args);
		return input.success && input.data.mode === "autonomous" && context.mode === "normal";
	}
	return context.mode === "normal" && APPROVAL_TOOLS.has(toolName);
}
