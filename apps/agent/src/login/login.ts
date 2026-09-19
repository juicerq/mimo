import type { AuthEvent, AuthInteraction, AuthPrompt, AuthType } from "@earendil-works/pi-ai";
import { connectGmail } from "../gmail/connect";
import { models } from "../model/models";
import type { Provider } from "../model/types";

const AUTH_TYPES: Record<Provider, AuthType> = { opencode: "api_key", "opencode-go": "api_key", "openai-codex": "oauth" };

export const LOGIN_GROUP_NAMES = { provider: "providers", plugin: "plugins" } as const;

export const LOGIN_TARGETS = [
	{ id: "opencode", name: "OpenCode Zen", how: "API key", group: "provider" },
	{ id: "opencode-go", name: "OpenCode Go", how: "API key", group: "provider" },
	{ id: "openai-codex", name: "OpenAI", how: "OAuth", group: "provider" },
	{ id: "gmail", name: "Gmail", how: "OAuth", group: "plugin" },
] as const;

export type LoginTarget = (typeof LOGIN_TARGETS)[number]["id"];

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
	readonly finished: Promise<void>;
	private readonly listeners = new Set<(event: LoginEvent) => void>();
	private readonly history: LoginEvent[] = [];
	private readonly aborter = new AbortController();
	private settle: { resolve: () => void; reject: (reason: Error) => void } | null = null;
	private pending: Pending | null = null;

	constructor(target: LoginTarget) {
		this.finished = new Promise<void>((resolve, reject) => {
			this.settle = { resolve, reject };
		});
		this.finished.catch(() => {});
		void this.run(target);
	}

	subscribe(listener: (event: LoginEvent) => void): () => void {
		this.listeners.add(listener);
		for (const event of this.history) {
			listener(event);
		}
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
		this.history.push(event);
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	private readonly notify = (event: AuthEvent): void => {
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

	private readonly ask = async (prompt: AuthPrompt): Promise<string> => {
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

	private async run(target: LoginTarget): Promise<void> {
		const interaction: AuthInteraction = {
			signal: this.aborter.signal,
			prompt: this.ask,
			notify: this.notify,
		};
		try {
			if (target === "gmail") {
				await connectGmail(interaction);
			} else {
				await models().login(target, AUTH_TYPES[target], interaction);
			}
			this.emit({ type: "done" });
			this.settle?.resolve();
		} catch (error) {
			const failure = error instanceof Error ? error : new Error(String(error));
			this.emit({ type: "failed", message: failure.message });
			this.settle?.reject(failure);
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
