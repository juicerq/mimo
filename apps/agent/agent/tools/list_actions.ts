import { defineTool } from "eve/tools";
import { z } from "zod";
import { listActions } from "../lib/actions";

export default defineTool({
	description: "Lê o registro de ações (envios e exclusões de rotina), do mais recente para o mais antigo.",
	inputSchema: z.object({
		limit: z.number().int().min(1).max(50).default(10).describe("Quantas ações listar."),
	}),
	async execute({ limit }, ctx) {
		return { actions: await listActions({ limit, sessionId: ctx.session.id }) };
	},
});
