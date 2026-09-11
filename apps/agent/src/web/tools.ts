import { z } from "zod";
import { tool } from "../tools/tool";
import { searchWeb } from "./exa";

const MAX_CHARACTERS = 6_000;

export function webTools() {
	return [
		tool({
			name: "web_search",
			description:
				"Pesquisa na web e devolve títulos, links e trechos dos resultados. Use para informações atuais ou que não estão nas ferramentas locais.",
			input: z.object({
				query: z.string().min(1).describe("O que pesquisar, descrevendo a página ideal."),
				maxResults: z.number().int().min(1).max(10).default(5).describe("Quantidade máxima de resultados."),
			}),
			async execute({ query, maxResults }) {
				const results = await searchWeb(query, maxResults);
				if (results.length <= MAX_CHARACTERS) {
					return results;
				}
				return `${results.slice(0, MAX_CHARACTERS)}…`;
			},
		}),
	];
}
