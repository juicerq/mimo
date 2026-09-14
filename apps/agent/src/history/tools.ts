import { z } from "zod";
import type { ToolContext } from "../tools/context";
import { tool } from "../tools/tool";
import { readHistory, searchHistory } from "./history";

export function historyTools(context: ToolContext) {
	return [
		tool({
			name: "search_history",
			description: "Busca no trecho da conversa que já saiu da janela deste bot. Retorna trechos e referências para read_history. Busca textual: todas as palavras devem aparecer no mesmo registro; sem query, mostra as falas da pessoa. Nenhum resultado não prova que o assunto nunca foi discutido: tente outros termos.",
			input: z.object({
				query: z.string().max(300).default(""),
				offset: z.number().int().min(0).default(0),
				limit: z.number().int().min(1).max(15).default(8),
			}),
			async execute(input) {
				return await searchHistory({ ...input, botId: context.botId });
			},
		}),
		tool({
			name: "read_history",
			description: "Lê as mensagens originais do trecho da conversa que já saiu da janela deste bot. Use as referências de search_history; comece algumas mensagens antes para ver o contexto. next indica continuação, inclusive de um registro longo. Ação solicitada ou aguardando aprovação não significa ação executada.",
			input: z.object({
				messageId: z.number().int().min(0).default(0),
				offset: z.number().int().min(0).default(0).describe("Deslocamento em caracteres, retornado em next para registros longos."),
				limit: z.number().int().min(1).max(20).default(6),
			}),
			async execute(input) {
				return await readHistory({ ...input, botId: context.botId });
			},
		}),
	];
}
