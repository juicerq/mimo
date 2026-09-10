import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchWeb } from "../lib/exa";

const MAX_CHARS = 6_000;

function truncate(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max)}…`;
}

export default defineTool({
	description:
		"Pesquisa na web e devolve títulos, links e trechos dos resultados. Use para informações atuais ou que não estão nas ferramentas locais.",
	inputSchema: z.object({
		query: z.string().min(1).describe("O que pesquisar, descrevendo a página ideal."),
		maxResults: z.number().int().min(1).max(10).default(5).describe("Quantidade máxima de resultados."),
	}),
	async execute({ query, maxResults }) {
		return truncate(await searchWeb(query, maxResults), MAX_CHARS);
	},
});
