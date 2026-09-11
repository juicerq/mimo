import { Client, type ClientSession, type InputResponse, type MessageStreamEvent } from "eve/client";
import { ModelCatalogSchema, type ModelSelection } from "@agent/model-info";
import { z } from "zod";
import { BotSchema, BotsSchema, type Bot } from "@agent/bots";

const DEFAULT_AGENT_URL = "http://127.0.0.1:2000";

export class AgentChat {
	readonly url: string;
	private readonly client: Client;

	constructor(url = process.env.MIMO_AGENT_URL ?? DEFAULT_AGENT_URL) {
		this.url = url;
		this.client = new Client({ host: url });
	}

	async connectionProblem(): Promise<string | null> {
		try {
			await this.client.health();
			return null;
		} catch (error) {
			return describeError(error);
		}
	}

	async listBots() {
		return BotsSchema.parse(await readResponse(await this.client.fetch("/mimo/bots")));
	}

	async createBot(name: string) {
		return BotSchema.parse(await readResponse(await this.client.fetch("/mimo/bots", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name }),
		})));
	}

	async models() {
		return ModelCatalogSchema.parse(await readResponse(await this.client.fetch("/mimo/models")));
	}

	async selectModel(id: string, selection: ModelSelection) {
		return BotSchema.parse(await readResponse(await this.client.fetch(`/mimo/bots/${id}/model`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(selection),
		})));
	}

	async openBot(id: string) {
		const bot = BotSchema.parse(await readResponse(await this.client.fetch(`/mimo/bots/${id}`)));
		return new BotChat(this.client, bot);
	}
}

export class BotChat {
	private session: ClientSession | null;

	constructor(private readonly client: Client, readonly bot: Bot) {
		this.session = bot.sessionId ? client.sessions.attach(bot.sessionId) : null;
	}

	async snapshot(signal: AbortSignal) {
		if (!this.session) {
			return [];
		}
		const snapshot = await this.session.snapshot({ signal });
		this.session = this.client.sessions.attach(snapshot.session.sessionId, { streamIndex: snapshot.session.streamIndex });
		return snapshot.events;
	}

	async send(message: string) {
		const bot = BotSchema.parse(await readResponse(await this.client.fetch(`/mimo/bots/${this.bot.id}/messages`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ message }),
		})));
		if (!bot.sessionId) {
			throw new Error("The bot has no session after sending a message.");
		}
		this.session ??= this.client.sessions.attach(bot.sessionId);
		return bot;
	}

	async respond(responses: readonly InputResponse[]): Promise<void> {
		if (!this.session) {
			throw new Error("the agent session has not been created yet");
		}
		await this.session.respond(responses);
	}

	async cancel(turnId: string | null) {
		if (!this.session) {
			throw new Error("The bot has no active session.");
		}
		if (turnId === null) {
			return await this.session.reset({ reason: "Interrupted while waiting for input" });
		}
		return await this.session.cancel({ turnId, tasks: true });
	}

	stream(signal: AbortSignal): AsyncIterable<MessageStreamEvent> | null {
		return (
			this.session?.stream({
				signal,
				streamReconnectPolicy: {
					streamIdleReconnectPolicy: { baseDelayMs: 250, maxAttempts: 60, maxDelayMs: 30_000 },
				},
			}) ?? null
		);
	}
}

async function readResponse(response: Response): Promise<unknown> {
	if (!response.ok) {
		const body = await response.json().catch(() => null);
		const parsed = z.object({ error: z.string() }).safeParse(body);
		throw new Error(parsed.success ? parsed.data.error : `Request failed: HTTP ${response.status}`);
	}
	return await response.json();
}

export function describeError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
