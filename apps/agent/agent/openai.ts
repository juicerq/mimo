import { createOpenAI } from "@ai-sdk/openai";
import { DefaultAuthProvider } from "@grikomsn/ai-sdk-provider-chatgpt-oauth";
import { wrapLanguageModel } from "ai";
import { z } from "zod";
import { ReasoningSchema, type ModelOption } from "./model-info";

const auth = new DefaultAuthProvider();
const BASE_URL = "https://chatgpt.com/backend-api/codex";
const ModelsSchema = z.object({
	models: z.array(z.object({
		slug: z.string().min(1),
		visibility: z.string(),
		default_reasoning_level: z.string(),
		supported_reasoning_levels: z.array(z.object({ effort: z.string() })),
		context_window: z.number().int().positive(),
	}).transform((model) => ({
		id: model.slug,
		visible: model.visibility === "list",
		defaultReasoning: model.default_reasoning_level,
		reasoningOptions: model.supported_reasoning_levels.flatMap(({ effort }) => {
			const parsed = ReasoningSchema.safeParse(effort);
			if (parsed.success) {
				return [parsed.data];
			}
			return [];
		}),
		contextWindowTokens: model.context_window,
	}))),
});

async function authHeaders() {
	const credentials = await auth.getCredentials();
	return {
		authorization: `Bearer ${credentials.accessToken}`,
		"chatgpt-account-id": credentials.accountId,
		originator: "eve",
	};
}

export async function openaiModels(): Promise<ModelOption[]> {
	const signal = AbortSignal.timeout(10_000);
	const headers = await Promise.race([
		authHeaders(),
		new Promise<never>((_resolve, reject) => {
			signal.addEventListener("abort", () => reject(signal.reason), { once: true });
		}),
	]);
	const response = await fetch(`${BASE_URL}/models?client_version=2.0.0`, { headers, signal });
	if (!response.ok) {
		throw new Error(`OpenAI models unavailable, HTTP ${response.status}. Check your Codex login and try /model again.`);
	}
	const { models } = ModelsSchema.parse(await response.json());
	return models.filter((model) => model.visible && model.reasoningOptions.length > 0).map((model) => {
		const defaultReasoning = model.reasoningOptions.find((effort) => effort === model.defaultReasoning) ?? model.reasoningOptions[0];
		return {
			provider: "openai-oauth",
			id: model.id,
			name: model.id,
			contextWindowTokens: model.contextWindowTokens,
			reasoningOptions: model.reasoningOptions,
			defaultReasoning,
		};
	});
}
const RequestSchema = z.looseObject({
	input: z.array(z.looseObject({ id: z.unknown().optional() })),
});

const openai = createOpenAI({
	name: "codex",
	apiKey: "oauth",
	baseURL: BASE_URL,
	fetch: Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
		const headers = new Headers(init?.headers);
		for (const [name, value] of Object.entries(await authHeaders())) {
			headers.set(name, value);
		}
		if (typeof init?.body !== "string") {
			throw new Error("Expected a JSON OpenAI request.");
		}
		const body = RequestSchema.parse(JSON.parse(init.body));
		body.input = body.input.map(({ id: _id, ...item }) => item);
		return await fetch(input, { ...init, headers, body: JSON.stringify(body) });
	}, { preconnect: fetch.preconnect }),
});

export function openaiModel(id: string) {
	return wrapLanguageModel({
		model: openai.responses(id),
		middleware: {
			specificationVersion: "v4",
			async transformParams({ params }) {
				const instructions = params.prompt.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
				const { maxOutputTokens: _maxOutputTokens, ...options } = params;
				return {
					...options,
					prompt: params.prompt.filter((message) => message.role !== "system"),
					providerOptions: {
						...params.providerOptions,
						openai: { ...params.providerOptions?.["openai"], instructions, store: false },
					},
				};
			},
		},
	});
}
