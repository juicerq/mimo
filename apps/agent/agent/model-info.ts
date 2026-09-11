import { z } from "zod";

export const ProviderSchema = z.enum(["opencode-go", "openai-oauth"]);
export const ReasoningSchema = z.enum(["provider-default", "none", "minimal", "low", "medium", "high", "xhigh", "max"]);

export const ModelSelectionSchema = z.object({
	provider: ProviderSchema,
	id: z.string().min(1),
	reasoning: ReasoningSchema,
});

export const ModelInfoSchema = ModelSelectionSchema.extend({
	name: z.string().min(1),
	contextWindowTokens: z.number().int().positive(),
});

const ModelOptionSchema = ModelInfoSchema.omit({ reasoning: true }).extend({
	reasoningOptions: z.array(ReasoningSchema).min(1),
	defaultReasoning: ReasoningSchema,
});

export const ModelCatalogSchema = z.object({
	models: z.array(ModelOptionSchema),
	errors: z.array(z.object({ provider: ProviderSchema, message: z.string() })),
});

export const PROVIDER_NAMES = { "opencode-go": "OpenCode Go", "openai-oauth": "OpenAI" };

export type ModelSelection = z.infer<typeof ModelSelectionSchema>;
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
export type ModelOption = z.infer<typeof ModelOptionSchema>;
export type ModelCatalog = z.infer<typeof ModelCatalogSchema>;
