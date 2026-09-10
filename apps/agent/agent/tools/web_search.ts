import { defineTool } from "eve/tools";
import { z } from "zod";

const MCP_URL = "https://mcp.exa.ai/mcp";
const MAX_CHARS = 6_000;
const REQUEST_TIMEOUT_MS = 30_000;

const envelopeSchema = z.object({
	result: z
		.object({
			content: z.array(z.object({ type: z.string(), text: z.string() })),
		})
		.optional(),
	error: z.object({ message: z.string() }).optional(),
});

function mcpUrl(): string {
	const apiKey = process.env.EXA_API_KEY;
	if (!apiKey) {
		return MCP_URL;
	}
	return `${MCP_URL}?exaApiKey=${encodeURIComponent(apiKey)}`;
}

function parseBody(body: string): unknown {
	const trimmed = body.trim();
	if (trimmed.startsWith("{")) {
		return JSON.parse(trimmed);
	}
	const data = body
		.split(/\r?\n/)
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trim())
		.join("\n");
	return JSON.parse(data);
}

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
		const response = await fetch(mcpUrl(), {
			method: "POST",
			headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name: "web_search_exa", arguments: { query, numResults: maxResults } },
			}),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!response.ok) {
			throw new Error(`A busca respondeu ${response.status}: ${(await response.text()).slice(0, 300)}`);
		}
		const envelope = envelopeSchema.parse(parseBody(await response.text()));
		if (envelope.error) {
			throw new Error(`A busca falhou: ${envelope.error.message}`);
		}
		const text = (envelope.result?.content ?? [])
			.map((part) => part.text)
			.join("\n")
			.trim();
		if (!text) {
			throw new Error("A busca não devolveu resultados.");
		}
		return truncate(text, MAX_CHARS);
	},
});
