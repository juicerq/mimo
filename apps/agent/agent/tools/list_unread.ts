import { defineTool } from "eve/tools";
import { z } from "zod";
import { listUnread } from "../lib/gmail/api";

export default defineTool({
	description:
		"Lista os e-mails não lidos da caixa de entrada do Gmail, do mais recente para o mais antigo, com remetente, assunto, data e prévia.",
	inputSchema: z.object({
		limit: z.number().int().min(1).max(25).default(10).describe("Quantidade máxima de e-mails a listar."),
	}),
	async execute({ limit }) {
		return listUnread(limit);
	},
});
