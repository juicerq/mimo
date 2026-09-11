import { defineTool } from "eve/tools";
import { z } from "zod";
import { currentBotId } from "../lib/bots";
import { readHistory } from "../lib/session-history";

export default defineTool({
	description: "Lê mensagens e ações originais de uma sessão arquivada deste bot. Use as referências de search_history; comece algumas mensagens antes para ver o contexto. next indica continuação, inclusive de um registro longo. Ação solicitada ou aguardando aprovação não significa ação executada.",
	inputSchema: z.object({
		sessionId: z.string().min(1),
		messageId: z.number().int().min(0).default(0),
		offset: z.number().int().min(0).default(0).describe("Deslocamento em caracteres, retornado em next para registros longos."),
		limit: z.number().int().min(1).max(20).default(6),
	}),
	async execute(input) {
		return await readHistory({ ...input, botId: currentBotId() });
	},
});
