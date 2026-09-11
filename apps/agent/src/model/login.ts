import type { AuthEvent, AuthPrompt, AuthType } from "@earendil-works/pi-ai";
import { models } from "./models";
import type { Provider } from "./types";

const AUTH_TYPES: Record<Provider, AuthType> = { "opencode-go": "api_key", "openai-codex": "oauth" };

interface LoginOption {
	id: string;
	label: string;
}

export interface LoginPrompt {
	kind: "text" | "secret" | "select";
	message: string;
	options: LoginOption[];
}

export type LoginEvent =
	| { type: "info"; text: string }
	| { type: "url"; url: string; instructions: string | null }
	| { type: "prompt"; prompt: LoginPrompt }
	| { type: "done" }
	| { type: "failed"; message: string };

interface Pending {
	prompt: LoginPrompt;
	resolve: (answer: string) => void;
	reject: (reason: Error) => void;
}

function toPrompt(prompt: AuthPrompt): LoginPrompt {
	if (prompt.type === "select") {
		return {
			kind: "select",
			message: prompt.message,
			options: prompt.options.map((option) => ({ id: option.id, label: option.label })),
		};
	}
	if (prompt.type === "secret") {
		return { kind: "secret", message: prompt.message, options: [] };
	}
	return { kind: "text", message: prompt.message, options: [] };
}

export class LoginSession {
	private readonly listeners = new Set<(event: LoginEvent) => void>();
	private readonly aborter = new AbortController();
	private pending: Pending | null = null;

	constructor(provider: Provider) {
		void this.run(provider);
	}

	subscribe(listener: (event: LoginEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	answer(text: string): void {
		const pending = this.pending;
		if (!pending) {
			return;
		}
		this.pending = null;
		pending.resolve(resolveAnswer(pending.prompt, text));
	}

	cancel(): void {
		this.pending?.reject(new Error("Login cancelled."));
		this.pending = null;
		this.aborter.abort();
	}

	private emit(event: LoginEvent): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	private notify(event: AuthEvent): void {
		if (event.type === "auth_url") {
			this.emit({ type: "url", url: event.url, instructions: event.instructions ?? null });
			return;
		}
		if (event.type === "device_code") {
			this.emit({ type: "url", url: event.verificationUri, instructions: `Code: ${event.userCode}` });
			return;
		}
		this.emit({ type: "info", text: event.message });
	}

	private async ask(prompt: AuthPrompt): Promise<string> {
		const translated = toPrompt(prompt);
		return await new Promise<string>((resolve, reject) => {
			this.pending = { prompt: translated, resolve, reject };
			prompt.signal?.addEventListener("abort", () => {
				this.pending = null;
				reject(new Error("Prompt cancelled."));
			}, { once: true });
			this.emit({ type: "prompt", prompt: translated });
		});
	}

	private async run(provider: Provider): Promise<void> {
		try {
			await models().login(provider, AUTH_TYPES[provider], {
				signal: this.aborter.signal,
				prompt: async (prompt) => await this.ask(prompt),
				notify: (event) => this.notify(event),
			});
			this.emit({ type: "done" });
		} catch (error) {
			this.emit({ type: "failed", message: error instanceof Error ? error.message : String(error) });
		}
	}
}

function resolveAnswer(prompt: LoginPrompt, text: string): string {
	if (prompt.kind !== "select") {
		return text;
	}
	const chosen = prompt.options[Number(text) - 1];
	return chosen?.id ?? text;
}
