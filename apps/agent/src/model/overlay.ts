import type { Api, Model, Provider, ThinkingLevelMap } from "@earendil-works/pi-ai";
import { z } from "zod";

const CATALOG_URL = "https://models.dev/api.json";
const PROVIDER_ID = "opencode-go";
const TIMEOUT_MS = 2_500;

const CatalogModelSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	family: z.string().min(1),
	reasoning: z.boolean(),
	reasoning_options: z.array(z.object({ type: z.string(), values: z.array(z.string()) })).optional(),
	modalities: z.object({ input: z.array(z.enum(["text", "image"])).min(1) }),
	limit: z.object({ context: z.number().positive(), output: z.number().positive() }),
	cost: z.object({
		input: z.number(),
		output: z.number(),
		cache_read: z.number().optional(),
		cache_write: z.number().optional(),
	}),
});

const CatalogSchema = z.object({
	[PROVIDER_ID]: z.object({ models: z.record(z.string(), z.unknown()) }),
});

type CatalogModel = z.infer<typeof CatalogModelSchema>;

function usableModels(raw: Record<string, unknown>): Record<string, CatalogModel> {
	const models: Record<string, CatalogModel> = {};
	for (const [id, value] of Object.entries(raw)) {
		const parsed = CatalogModelSchema.safeParse(value);
		if (parsed.success) {
			models[id] = parsed.data;
		}
	}
	return models;
}

async function fetchCatalog(): Promise<Record<string, CatalogModel> | null> {
	const response = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
	if (!response?.ok) {
		return null;
	}
	const parsed = CatalogSchema.safeParse(await response.json().catch(() => null));
	if (!parsed.success) {
		return null;
	}
	return usableModels(parsed.data[PROVIDER_ID].models);
}

function sibling(base: readonly Model<Api>[], catalog: Record<string, CatalogModel>, family: string): Model<Api> | undefined {
	return base.find((model) => catalog[model.id]?.family === family);
}

function thinkingLevels(entry: CatalogModel, kin: Model<Api>): ThinkingLevelMap | undefined {
	const effort = entry.reasoning_options?.find((option) => option.type === "effort");
	if (!effort || !kin.thinkingLevelMap) {
		return kin.thinkingLevelMap;
	}
	const offered = new Set(effort.values);
	return Object.fromEntries(Object.entries(kin.thinkingLevelMap)
		.map(([level, value]) => [level, offered.has(level) ? value : null]));
}

function asModel(entry: CatalogModel, kin: Model<Api>): Model<Api> {
	return {
		...kin,
		thinkingLevelMap: thinkingLevels(entry, kin),
		id: entry.id,
		name: entry.name,
		reasoning: entry.reasoning,
		input: entry.modalities.input,
		contextWindow: entry.limit.context,
		maxTokens: entry.limit.output,
		cost: { input: entry.cost.input, output: entry.cost.output, cacheRead: entry.cost.cache_read ?? 0, cacheWrite: entry.cost.cache_write ?? 0 },
	};
}

function adopt(entry: CatalogModel, base: readonly Model<Api>[], catalog: Record<string, CatalogModel>): Model<Api> | null {
	const kin = sibling(base, catalog, entry.family);
	if (!kin) {
		return null;
	}
	return asModel(entry, kin);
}

async function extraModels(base: readonly Model<Api>[]): Promise<Model<Api>[] | null> {
	const catalog = await fetchCatalog();
	if (catalog === null) {
		return null;
	}
	const known = new Set(base.map((model) => model.id));
	return Object.values(catalog)
		.filter((entry) => !known.has(entry.id))
		.map((entry) => adopt(entry, base, catalog))
		.filter((model) => model !== null);
}

let extra: Model<Api>[] = [];
let loading: Promise<void> | null = null;

export function withCatalog(base: Provider): Provider {
	return { ...base, getModels: () => [...base.getModels(), ...extra] };
}

export async function loadCatalog(provider: Provider): Promise<void> {
	if (provider.id !== PROVIDER_ID) {
		return;
	}
	if (loading === null) {
		loading = extraModels(provider.getModels()).then((models) => {
			if (models === null) {
				loading = null;
				return;
			}
			extra = models;
		});
	}
	await loading;
}
