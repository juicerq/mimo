import { z } from "zod";
import type { ToolContext } from "../tools/context";
import { tool } from "../tools/tool";
import { listActions } from "./actions";

export function actionTools(context: ToolContext) {
	return [
		tool({
			name: "list_actions",
			description: "Lê o registro de ações (envios e exclusões de rotina), do mais recente para o mais antigo.",
			input: z.object({
				limit: z.number().int().min(1).max(50).default(10).describe("Quantas ações listar."),
			}),
			async execute({ limit }) {
				return { actions: await listActions({ limit, sessionId: context.sessionId }) };
			},
		}),
	];
}
