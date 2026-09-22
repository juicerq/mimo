import { createProvider, type Api, type Model, type Provider, type RefreshModelsContext, type ThinkingLevel, type ThinkingLevelMap } from "@earendil-works/pi-ai";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { readTextFile } from "../storage/files";

const CODEX_CACHE = join(homedir(), ".codex", "models_cache.json");
const INPUTS = ["text", "image"] as const;
const LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const satisfies readonly ThinkingLevel[];

const CodexCacheSchema = z.looseObject({ client_version: z.string().min(1) });

const CodexCredentialSchema = z.looseObject({ type: z.literal("oauth"), access: z.string().min(1), accountId: z.string().min(1) });

const CodexModelSchema = z.looseObject({
	slug: z.string().min(1),
	display_name: z.string().min(1),
	context_window: z.number().positive(),
	input_modalities: z.array(z.string()),
	supported_reasoning_levels: z.array(z.looseObject({ effort: z.string() })),
}).transform((raw) => ({
	id: raw.slug,
	name: raw.display_name.replace(/-(?=[A-Z][a-z])/g, " "),
	contextWindow: raw.context_window,
	input: INPUTS.filter((kind) => raw.input_modalities.includes(kind)),
	efforts: new Set(raw.supported_reasoning_levels.map((level) => level.effort)),
}));

const CodexModelsSchema = z.object({ models: z.array(z.looseObject({ visibility: z.string() })) });

type CodexModel = z.infer<typeof CodexModelSchema>;

async function clientVersion(): Promise<string> {
	const text = await readTextFile(CODEX_CACHE);
	if (text === null) {
		throw new Error(`Codex CLI version not found in ${CODEX_CACHE}. New OpenAI models need Codex CLI to have run once.`);
	}
	return CodexCacheSchema.parse(JSON.parse(text)).client_version;
}

function sharedPrefix(a: string, b: string): number {
	const theirs = b.split("-");
	const ours = a.split("-");
	const differs = ours.findIndex((part, index) => part !== theirs[index]);
	if (differs === -1) {
		return ours.length;
	}
	return differs;
}

function kinOf(id: string, known: readonly Model<Api>[]): Model<Api> {
	const [kin] = known.toSorted((a, b) => sharedPrefix(b.id, id) - sharedPrefix(a.id, id));
	if (!kin) {
		throw new Error("Codex provider has no known model to copy from.");
	}
	return kin;
}

function thinkingLevels(entry: CodexModel, kin: Model<Api>): ThinkingLevelMap {
	const levels = LEVELS.map((level) => {
		const effort = kin.thinkingLevelMap?.[level] ?? level;
		return [level, entry.efforts.has(effort) ? effort : null];
	});
	return { ...kin.thinkingLevelMap, ...Object.fromEntries(levels) };
}

function asModel(entry: CodexModel, kin: Model<Api>): Model<Api> {
	return {
		...kin,
		id: entry.id,
		name: entry.name,
		input: entry.input,
		contextWindow: entry.contextWindow,
		thinkingLevelMap: thinkingLevels(entry, kin),
	};
}

export function withLiveModels(base: Provider): Provider {
	const known = base.getModels();

	async function fetchModels(context: RefreshModelsContext): Promise<Model<Api>[]> {
		const credential = CodexCredentialSchema.parse(context.credential);
		const url = new URL(`${base.baseUrl}/codex/models`);
		url.searchParams.set("client_version", await clientVersion());
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${credential.access}`, "chatgpt-account-id": credential.accountId },
			signal: context.signal,
		});
		if (!response.ok) {
			throw new Error(`Codex model list answered ${response.status}.`);
		}
		const listed = CodexModelsSchema.parse(await response.json()).models.filter((entry) => entry.visibility === "list");
		return CodexModelSchema.array().parse(listed)
			.filter((entry) => !known.some((model) => model.id === entry.id))
			.map((entry) => asModel(entry, kinOf(entry.id, known)));
	}

	return createProvider({ id: base.id, name: base.name, baseUrl: base.baseUrl, auth: base.auth, models: known, api: base, fetchModels });
}
