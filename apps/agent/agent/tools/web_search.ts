import { defineTool } from "eve/tools";
import { z } from "zod";

const SEARCH_URL = "https://api.tavily.com/search";
const MAX_SNIPPET_CHARS = 400;

const responseSchema = z.object({
	results: z.array(
		z.object({
			title: z.string(),
			url: z.string(),
			content: z.string().optional(),
		}),
	),
});

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
		query: z.string().min(1).describe("O que pesquisar."),
		maxResults: z.number().int().min(1).max(10).default(5).describe("Quantidade máxima de resultados."),
	}),
	async execute({ query, maxResults }) {
		const apiKey = process.env.TAVILY_API_KEY;
		if (!apiKey) {
			throw new Error(
				"A busca na web não está configurada: defina TAVILY_API_KEY em apps/agent/.env.local (veja apps/agent/.env.example).",
			);
		}
		const response = await fetch(SEARCH_URL, {
			method: "POST",
			headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
			body: JSON.stringify({ query, max_results: maxResults, search_depth: "basic" }),
		});
		if (!response.ok) {
			throw new Error(`A busca respondeu ${response.status}: ${(await response.text()).slice(0, 300)}`);
		}
		const payload = responseSchema.parse(await response.json());
		return {
			query,
			results: payload.results.map((result) => ({
				title: result.title,
				url: result.url,
				snippet: truncate(result.content ?? "", MAX_SNIPPET_CHARS),
			})),
		};
	},
});
