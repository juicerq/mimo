import { z } from "zod";

const MCP_URL = "https://mcp.exa.ai/mcp";
const PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "mimo", version: "0.1.0" };
const REQUEST_TIMEOUT_MS = 30_000;
const TIMEOUT_SECONDS = REQUEST_TIMEOUT_MS / 1_000;

const envelopeSchema = z.object({
	id: z.union([z.number(), z.string()]).optional(),
	result: z
		.object({
			content: z.array(z.object({ type: z.string(), text: z.string() })),
		})
		.optional(),
	error: z.object({ code: z.number().optional(), message: z.string() }).optional(),
});

type Envelope = z.infer<typeof envelopeSchema>;

class SessionExpiredError extends Error {}

let sessionId: string | null = null;

function endpoint(): string {
	const apiKey = process.env.EXA_API_KEY;
	if (!apiKey) {
		return MCP_URL;
	}
	return `${MCP_URL}?exaApiKey=${encodeURIComponent(apiKey)}`;
}

function headers(): Record<string, string> {
	const result: Record<string, string> = {
		"content-type": "application/json",
		accept: "application/json, text/event-stream",
		"mcp-protocol-version": PROTOCOL_VERSION,
	};
	if (sessionId !== null) {
		result["mcp-session-id"] = sessionId;
	}
	return result;
}

async function post(body: unknown): Promise<Response> {
	try {
		return await fetch(endpoint(), {
			method: "POST",
			headers: headers(),
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	} catch (error) {
		if (error instanceof Error && error.name === "TimeoutError") {
			throw new Error(`A busca não respondeu em ${TIMEOUT_SECONDS} segundos e foi cancelada. Tente de novo.`);
		}
		throw new Error(
			`Não consegui falar com a busca (${error instanceof Error ? error.message : String(error)}). Verifique a conexão e tente de novo.`,
		);
	}
}

async function describeFailure(response: Response): Promise<string> {
	if (response.status === 429) {
		return "A busca recusou a chamada por excesso de pedidos (429). Espere alguns minutos ou configure EXA_API_KEY em ~/.mimo/.env para limites maiores.";
	}
	return `A busca respondeu ${response.status}: ${(await response.text()).slice(0, 300)}`;
}

function parseEvents(body: string): unknown[] {
	const trimmed = body.trim();
	if (trimmed.startsWith("{")) {
		return [JSON.parse(trimmed)];
	}
	const events: unknown[] = [];
	for (const block of body.split(/\r?\n\r?\n/)) {
		const data = block
			.split(/\r?\n/)
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice(5).trim())
			.join("\n");
		if (data.length > 0) {
			events.push(JSON.parse(data));
		}
	}
	return events;
}

function responseEnvelope(body: string): Envelope {
	for (const event of parseEvents(body)) {
		const parsed = envelopeSchema.safeParse(event);
		if (parsed.success && parsed.data.id !== undefined) {
			return parsed.data;
		}
	}
	throw new Error("A busca devolveu uma resposta inesperada.");
}

async function openSession(): Promise<void> {
	sessionId = null;
	const initialized = await post({
		jsonrpc: "2.0",
		id: "initialize",
		method: "initialize",
		params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
	});
	if (!initialized.ok) {
		throw new Error(await describeFailure(initialized));
	}
	sessionId = initialized.headers.get("mcp-session-id");
	await initialized.text();
	const ready = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
	if (!ready.ok) {
		throw new Error(await describeFailure(ready));
	}
	await ready.text();
}

async function callTool(query: string, maxResults: number): Promise<string> {
	const response = await post({
		jsonrpc: "2.0",
		id: 1,
		method: "tools/call",
		params: { name: "web_search_exa", arguments: { query, numResults: maxResults } },
	});
	if (response.status === 404) {
		await response.text().catch(() => "");
		throw new SessionExpiredError("A sessão da busca expirou.");
	}
	if (!response.ok) {
		throw new Error(await describeFailure(response));
	}
	const envelope = responseEnvelope(await response.text());
	if (envelope.error) {
		if (/session/i.test(envelope.error.message)) {
			throw new SessionExpiredError(envelope.error.message);
		}
		throw new Error(`A busca falhou: ${envelope.error.message}`);
	}
	const text = (envelope.result?.content ?? [])
		.map((part) => part.text)
		.join("\n")
		.trim();
	if (!text) {
		throw new Error("A busca não devolveu resultados.");
	}
	return text;
}

export async function searchWeb(query: string, maxResults: number): Promise<string> {
	if (sessionId === null) {
		await openSession();
	}
	try {
		return await callTool(query, maxResults);
	} catch (error) {
		if (!(error instanceof SessionExpiredError)) {
			throw error;
		}
		await openSession();
		return callTool(query, maxResults);
	}
}
