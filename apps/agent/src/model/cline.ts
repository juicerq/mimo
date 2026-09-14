import { createProvider, envApiKeyAuth, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

const BASE_URL = "https://api.cline.bot/api/v1";

const CLINE_MODELS: Model<"openai-completions">[] = [
	{
		id: "deepseek/deepseek-v4.1-flash",
		name: "DeepSeek V4.1 Flash",
		api: "openai-completions",
		provider: "cline",
		baseUrl: BASE_URL,
		reasoning: true,
		thinkingLevelMap: { minimal: null, low: "low", medium: null, high: "high", max: "max" },
		input: ["text", "image"],
		cost: { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0 },
		contextWindow: 1_000_000,
		maxTokens: 384_000,
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			supportsReasoningEffort: true,
			maxTokensField: "max_tokens",
			requiresReasoningContentOnAssistantMessages: true,
		},
	},
	{
		id: "z-ai/glm-5.3-flash",
		name: "GLM-5.3 Flash",
		api: "openai-completions",
		provider: "cline",
		baseUrl: BASE_URL,
		reasoning: true,
		thinkingLevelMap: { off: null, minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" },
		input: ["text", "image"],
		cost: { input: 0.075, output: 0.025, cacheRead: 0.015, cacheWrite: 0 },
		contextWindow: 1_000_000,
		maxTokens: 131_072,
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			supportsReasoningEffort: true,
			maxTokensField: "max_tokens",
			requiresReasoningContentOnAssistantMessages: true,
		},
	},
	{
		id: "meta/muse-spark-1.3-contributor",
		name: "Muse Spark 1.3 Contributor",
		api: "openai-completions",
		provider: "cline",
		baseUrl: BASE_URL,
		reasoning: true,
		thinkingLevelMap: { minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
		input: ["text", "image"],
		cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0 },
		contextWindow: 1_048_576,
		maxTokens: 131_072,
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			supportsReasoningEffort: true,
			maxTokensField: "max_tokens",
		},
	},
];

export function clineProvider() {
	return createProvider<"openai-completions">({
		id: "cline",
		name: "Cline",
		baseUrl: BASE_URL,
		auth: { apiKey: envApiKeyAuth("Cline API key", ["CLINE_API_KEY"]) },
		models: CLINE_MODELS,
		api: openAICompletionsApi(),
	});
}