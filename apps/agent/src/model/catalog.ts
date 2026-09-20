import type { Api, Model } from "@earendil-works/pi-ai";
import { models } from "./models";
import { loadCatalog } from "./overlay";
import {
	PROVIDER_NAMES,
	ProviderSchema,
	ReasoningSchema,
	type ModelCatalog,
	type ModelInfo,
	type ModelOption,
	type ModelSelection,
	type Provider,
	type Reasoning,
} from "./types";

const EXPLICIT_LEVELS = new Set<Reasoning>(["xhigh", "max"]);
const PREFERRED_DEFAULTS: Reasoning[] = ["medium", "high", "low", "minimal", "xhigh", "max", "off"];
const DEFAULT_MODEL = "openai-codex/gpt-5.6-luna";
const DEFAULT_REASONING: Reasoning = "max";

function reasoningOptions(model: Model<Api>): Reasoning[] {
	if (!model.reasoning) {
		return ["off"];
	}
	const levels = model.thinkingLevelMap;
	return ReasoningSchema.options.filter((level) =>
		EXPLICIT_LEVELS.has(level) ? levels?.[level] != null : levels?.[level] !== null);
}

function toOption(provider: Provider, model: Model<Api>): ModelOption {
	const options = reasoningOptions(model);
	return {
		provider,
		id: model.id,
		name: model.name,
		contextWindowTokens: model.contextWindow,
		reasoningOptions: options,
		defaultReasoning: PREFERRED_DEFAULTS.find((level) => options.includes(level)) ?? options[0],
	};
}

async function providerOptions(provider: Provider): Promise<ModelOption[]> {
	const registered = models().getProvider(provider);
	if (registered) {
		await loadCatalog(registered);
	}
	const available = await models().getAvailable(provider);
	if (available.length === 0) {
		throw new Error(`${PROVIDER_NAMES[provider]} is not connected. Log in from Settings and try again.`);
	}
	return available.map((model) => toOption(provider, model));
}

export async function listModels(): Promise<ModelCatalog> {
	const providers = ProviderSchema.options;
	const results = await Promise.allSettled(providers.map(providerOptions));
	const catalog: ModelCatalog = { models: [], errors: [] };
	for (const [index, result] of results.entries()) {
		if (result.status === "fulfilled") {
			catalog.models.push(...result.value);
		} else {
			catalog.errors.push({ provider: providers[index], message: describeCatalogError(result.reason) });
		}
	}
	return catalog;
}

function describeCatalogError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Could not load models. Check the provider login and try again.";
}

function modelOption(selection: Pick<ModelSelection, "provider" | "id">): ModelOption {
	const model = models().getModel(selection.provider, selection.id);
	if (!model) {
		throw new Error("This model is unavailable. Pick another one.");
	}
	return toOption(selection.provider, model);
}

export function selectModel(selection: ModelSelection): ModelInfo {
	const option = modelOption(selection);
	if (!option.reasoningOptions.includes(selection.reasoning)) {
		throw new Error("This model or effort is unavailable. Pick another one.");
	}
	return { ...selection, name: option.name, contextWindowTokens: option.contextWindowTokens };
}

export function initialModel(): ModelInfo {
	const spec = process.env.MIMO_MODEL ?? DEFAULT_MODEL;
	const slash = spec.indexOf("/");
	const provider = ProviderSchema.parse(spec.slice(0, slash));
	const option = modelOption({ provider, id: spec.slice(slash + 1) });
	const preferred = spec === DEFAULT_MODEL ? DEFAULT_REASONING : option.defaultReasoning;
	const reasoning = ReasoningSchema.parse(process.env.MIMO_REASONING ?? preferred);
	if (!option.reasoningOptions.includes(reasoning)) {
		throw new Error(`Unsupported effort ${reasoning} for ${spec}.`);
	}
	return { provider, id: option.id, reasoning, name: option.name, contextWindowTokens: option.contextWindowTokens };
}

export function resolveModel(info: Pick<ModelInfo, "provider" | "id">): Model<Api> {
	const model = models().getModel(info.provider, info.id);
	if (!model) {
		throw new Error(`Unknown model ${info.provider}/${info.id}. Pick another one.`);
	}
	return model;
}
