import { Client, type ClientSession, type InputResponse, type MessageResponse } from "eve/client";

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

	async send(text: string): Promise<MessageResponse> {
		if (this.session) {
			return this.session.send(text);
		}
		const { session, response } = await this.client.sessions.create({ message: text });
		this.session = session;
		return response;
	}

	async respond(responses: readonly InputResponse[]): Promise<MessageResponse> {
		if (!this.session) {
			throw new Error("a sessão do agente ainda não foi criada");
		}
		return this.session.respond(responses);
	}
}

export function describeError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
