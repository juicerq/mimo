import { Client, type ClientSession, type InputResponse, type MessageStreamEvent } from "eve/client";

const DEFAULT_AGENT_URL = "http://127.0.0.1:2000";

export class AgentChat {
	readonly url: string;
	private readonly client: Client;
	private session: ClientSession | null = null;

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

	async send(text: string): Promise<void> {
		if (this.session) {
			await this.session.send(text);
			return;
		}
		const { session } = await this.client.sessions.create({ message: text });
		this.session = session;
	}

	async respond(responses: readonly InputResponse[]): Promise<void> {
		if (!this.session) {
			throw new Error("a sessão do agente ainda não foi criada");
		}
		await this.session.respond(responses);
	}

	stream(): AsyncIterable<MessageStreamEvent> | null {
		return (
			this.session?.stream({
				streamReconnectPolicy: {
					streamIdleReconnectPolicy: { baseDelayMs: 250, maxAttempts: 60, maxDelayMs: 30_000 },
				},
			}) ?? null
		);
	}
}

export function describeError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
