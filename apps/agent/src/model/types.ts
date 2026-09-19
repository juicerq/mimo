import { z } from "zod";

export const ProviderSchema = z.enum(["opencode", "opencode-go", "openai-codex"]);
export const ReasoningSchema = z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

export const ModelSelectionSchema = z.object({
	provider: ProviderSchema,
	id: z.string().min(1),
	reasoning: ReasoningSchema,
});

export const PROVIDER_NAMES: Record<Provider, string> = { opencode: "OpenCode Zen", "opencode-go": "OpenCode Go", "openai-codex": "OpenAI" };

export type Provider = z.infer<typeof ProviderSchema>;
export type Reasoning = z.infer<typeof ReasoningSchema>;
export type ModelSelection = z.infer<typeof ModelSelectionSchema>;

export interface ModelInfo extends ModelSelection {
	name: string;
	contextWindowTokens: number;
}

export interface ModelOption extends Omit<ModelInfo, "reasoning"> {
	reasoningOptions: Reasoning[];
	defaultReasoning: Reasoning;
}

export interface ModelCatalog {
	models: ModelOption[];
	errors: { provider: Provider; message: string }[];
}
