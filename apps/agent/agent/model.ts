import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AgentModelOptionsDefinition } from "eve";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { ProviderSchema, ReasoningSchema, type ModelCatalog, type ModelInfo, type ModelOption, type ModelSelection } from "./model-info";
import { openaiModel, openaiModels } from "./openai";

const OPENCODE_BASE_URL = "https://opencode.ai/zen/go/v1";
const OPENCODE_AUTH_PATH = join(homedir(), ".local", "share", "opencode", "auth.json");
const OpencodeAuthSchema = z.object({ "opencode-go": z.object({ key: z.string().min(1) }).optional() });
const OPENCODE_MODELS: ModelOption[] = [
	{ provider: "opencode-go", id: "deepseek-flash", name: "deepseek-v4.1-flash", contextWindowTokens: 1_000_000, reasoningOptions: ["high"], defaultReasoning: "high" },
	{ provider: "opencode-go", id: "deepseek-v4-pro", name: "deepseek-v4-pro", contextWindowTokens: 1_000_000, reasoningOptions: ["high"], defaultReasoning: "high" },
	{ provider: "opencode-go", id: "glm-5.3", name: "glm-5.3", contextWindowTokens: 1_000_000, reasoningOptions: ["provider-default"], defaultReasoning: "provider-default" },
	{ provider: "opencode-go", id: "kimi-k3", name: "kimi-k3", contextWindowTokens: 1_048_576, reasoningOptions: ["provider-default"], defaultReasoning: "provider-default" },
];

function opencodeKey() {
	if (process.env.OPENCODE_API_KEY) {
		return process.env.OPENCODE_API_KEY;
	}
	const auth = OpencodeAuthSchema.parse(JSON.parse(readFileSync(OPENCODE_AUTH_PATH, "utf8")));
	const stored = auth["opencode-go"]?.key;
	if (!stored) {
		throw new Error("OpenCode Go is not connected. Set OPENCODE_API_KEY or log in through OpenCode.");
	}
	return stored;
}

async function providerModels(provider: ModelSelection["provider"]) {
	if (provider === "openai-oauth") {
		return await openaiModels();
	}
	opencodeKey();
	return OPENCODE_MODELS;
}

export async function listModels(): Promise<ModelCatalog> {
	const providers = ProviderSchema.options;
	const results = await Promise.allSettled(providers.map(providerModels));
	const catalog: ModelCatalog = { models: [], errors: [] };
	for (const [index, result] of results.entries()) {
		if (result.status === "fulfilled") {
			catalog.models.push(...result.value);
		} else {
			catalog.errors.push({ provider: providers[index], message: catalogError(result.reason) });
		}
	}
	return catalog;
}

function catalogError(error: unknown) {
	if (error instanceof Error && error.name === "TimeoutError") {
		return "The model catalog timed out. Try /model again.";
	}
	if (error instanceof Error) {
		return `${error.message} Check the provider login and try /model again.`;
	}
	return "Could not load models. Check the provider login and try /model again.";
}

export async function selectModel(selection: ModelSelection): Promise<ModelInfo> {
	const models = await providerModels(selection.provider);
	const option = models.find((model) => model.id === selection.id);
	if (!option || !option.reasoningOptions.includes(selection.reasoning)) {
		throw new Error("This model or effort is unavailable. Open /model again.");
	}
	return { ...selection, name: option.name, contextWindowTokens: option.contextWindowTokens };
}

export async function initialModel(): Promise<ModelInfo> {
	const spec = process.env.MIMO_MODEL ?? "opencode-go/deepseek-flash";
	const slash = spec.indexOf("/");
	const provider = ProviderSchema.parse(spec.slice(0, slash));
	const id = spec.slice(slash + 1);
	const models = provider === "opencode-go" ? OPENCODE_MODELS : await openaiModels();
	const option = models.find((model) => model.id === id);
	if (!option) {
		throw new Error(`Unknown initial model: ${spec}.`);
	}
	const reasoning = ReasoningSchema.parse(process.env.MIMO_REASONING ?? option.defaultReasoning);
	if (!option.reasoningOptions.includes(reasoning)) {
		throw new Error(`Unsupported effort ${reasoning} for ${spec}.`);
	}
	return {
		provider,
		id,
		reasoning,
		name: option.name,
		contextWindowTokens: z.coerce.number().int().positive().parse(process.env.MIMO_CONTEXT_WINDOW ?? option.contextWindowTokens),
	};
}

function providerOptions({ provider, reasoning }: ModelSelection): AgentModelOptionsDefinition {
	if (provider === "openai-oauth") {
		return { providerOptions: { openai: reasoning === "provider-default" ? {} : { reasoningEffort: reasoning } } };
	}
	return { providerOptions: { opencodeGo: reasoning === "provider-default" ? {} : { reasoningEffort: reasoning } } };
}

export function resolveModel(selection: ModelInfo, sessionId: string) {
	const { provider, id, contextWindowTokens } = selection;
	if (provider === "openai-oauth") {
		return {
			model: openaiModel(id),
			modelContextWindowTokens: contextWindowTokens,
			modelOptions: providerOptions(selection),
		};
	}
	return {
		model: createOpenAICompatible({
			name: "opencode-go",
			baseURL: OPENCODE_BASE_URL,
			apiKey: opencodeKey(),
			headers: { "user-agent": "mimo-tui/0.1", "x-opencode-session": sessionId },
		})(id),
		modelContextWindowTokens: contextWindowTokens,
		modelOptions: providerOptions(selection),
	};
}
