import { z } from "zod";
import type { ToolContext } from "../tools/context";
import { tool } from "../tools/tool";
import { listActions } from "./actions";

export function actionTools(context: ToolContext) {
	return [
		tool({
			name: "list_actions",
			description: "Lê as ações que este bot já fez (envios e exclusões de rotina), da mais recente para a mais antiga. O registro dura: ele sobrevive a reinícios.",
			input: z.object({
				limit: z.number().int().min(1).max(50).default(10).describe("Quantas ações listar."),
			}),
			async execute({ limit }) {
				return { actions: await listActions({ limit, botId: context.botId }) };
			},
		}),
	];
}
