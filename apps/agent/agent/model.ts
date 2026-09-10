import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { chatgptOAuth } from "@grikomsn/ai-sdk-provider-chatgpt-oauth";
import type { LanguageModel } from "ai";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_MODEL = "opencode-go/deepseek-flash";
const MAX_CONTEXT_WINDOW = 300_000;
const FALLBACK_CONTEXT_WINDOW = 200_000;
const OPENCODE_BASE_URL = "https://opencode.ai/zen/go/v1";
const OPENCODE_AUTH_PATH = join(homedir(), ".local", "share", "opencode", "auth.json");

const CONTEXT_WINDOWS: Record<string, number> = {
	"opencode-go/deepseek-flash": 1_000_000,
	"opencode-go/glm-5.3": 1_000_000,
	"opencode-go/deepseek-v4-pro": 1_000_000,
	"opencode-go/kimi-k3": 1_048_576,
	"openai-oauth/gpt-5.5": 372_000,
	"openai-oauth/gpt-5.4": 272_000,
	"openai-oauth/gpt-5.4-mini": 272_000,
};

let cachedOpencodeKey: string | undefined;

function opencodeKey(): string {
	if (cachedOpencodeKey !== undefined) {
		return cachedOpencodeKey;
	}
	const fromEnv = process.env.OPENCODE_API_KEY;
	if (fromEnv) {
		cachedOpencodeKey = fromEnv;
		return cachedOpencodeKey;
	}
	const auth: { "opencode-go"?: { key?: string } } = JSON.parse(
		readFileSync(OPENCODE_AUTH_PATH, "utf8"),
	);
	const stored = auth["opencode-go"]?.key;
	if (!stored) {
		throw new Error("chave do opencode-go ausente");
	}
	cachedOpencodeKey = stored;
	return cachedOpencodeKey;
}

function splitModel(spec: string): { provider: string; id: string } {
	const slash = spec.indexOf("/");
	if (slash === -1) {
		throw new Error(`modelo invalido: ${spec}`);
	}
	return { provider: spec.slice(0, slash), id: spec.slice(slash + 1) };
}

function createModel(provider: string, id: string, sessionId: string): LanguageModel {
	if (provider === "openai-oauth") {
		return chatgptOAuth()(id);
	}
	return createOpenAICompatible({
		name: "opencode-go",
		baseURL: OPENCODE_BASE_URL,
		apiKey: opencodeKey(),
		headers: {
			"user-agent": "mimo-tui/0.1",
			"x-opencode-session": sessionId,
		},
	})(id);
}

export interface ResolvedModel {
	model: LanguageModel;
	contextWindowTokens: number;
}

export function resolveModel(
	sessionId: string,
	spec = process.env.MIMO_MODEL ?? DEFAULT_MODEL,
): ResolvedModel {
	const { provider, id } = splitModel(spec);
	const declaredContextWindow = Number(
		process.env.MIMO_CONTEXT_WINDOW ?? CONTEXT_WINDOWS[spec] ?? FALLBACK_CONTEXT_WINDOW,
	);
	return {
		model: createModel(provider, id, sessionId),
		contextWindowTokens: Math.min(declaredContextWindow, MAX_CONTEXT_WINDOW),
	};
}
