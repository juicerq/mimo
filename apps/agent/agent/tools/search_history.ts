import { defineTool } from "eve/tools";
import { z } from "zod";
import { currentBotId } from "../lib/bots";
import { searchHistory } from "../lib/session-history";

export default defineTool({
	description: "Busca nos históricos arquivados deste bot. Retorna trechos e referências para read_history. Busca textual: todas as palavras devem aparecer no mesmo registro; sem query, mostra uma entrada por sessão. Nenhum resultado não prova que o assunto nunca foi discutido: tente outros termos.",
	inputSchema: z.object({
		query: z.string().max(300).default(""),
		offset: z.number().int().min(0).default(0),
		limit: z.number().int().min(1).max(15).default(8),
	}),
	async execute(input) {
		return await searchHistory({ ...input, botId: currentBotId() });
	},
});
