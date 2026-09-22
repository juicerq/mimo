import { createModels, type Api, type Credential, type CredentialStore, type Model, type Models, type ModelsRefreshResult, type ModelsStore } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { opencodeProvider } from "@earendil-works/pi-ai/providers/opencode";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";
import { homedir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { database } from "../storage/database";
import { readTextFile, writeTextFile } from "../storage/files";
import { modelCatalogs } from "../storage/schema";
import { withLiveModels } from "./codex";
import { withCatalog } from "./overlay";
import { withFreeTier } from "./zen";
import { ProviderSchema, type Provider } from "./types";

const CODEX_TOKEN_LIFETIME_MS = 3_600_000;
const SESSION_HEADERS: Partial<Record<string, string>> = { "opencode-go": "x-opencode-session" };

const CodexAuthSchema = z.looseObject({
	tokens: z.looseObject({
		access_token: z.string().min(1),
		refresh_token: z.string().min(1),
		account_id: z.string().min(1),
	}),
	last_refresh: z.string().min(1),
});

const OpencodeAuthSchema = z.looseObject({
	opencode: z.looseObject({ key: z.string().min(1) }).optional(),
	"opencode-go": z.looseObject({ key: z.string().min(1) }).optional(),
});

interface AuthFile {
	path: string;
	parse(raw: unknown): Credential;
	serialize(raw: unknown, credential: Credential): unknown;
}

type OpencodeEntry = "opencode" | "opencode-go";

function opencodeAuthFile(entry: OpencodeEntry, fallback: OpencodeEntry): AuthFile {
	return {
		path: join(homedir(), ".local", "share", "opencode", "auth.json"),
		parse(raw) {
			const auth = OpencodeAuthSchema.parse(raw);
			const key = auth[entry]?.key ?? auth[fallback]?.key;
			if (!key) {
				throw new Error("OpenCode is not connected. Log in and try again.");
			}
			return { type: "api_key", key };
		},
		serialize(raw, credential) {
			if (credential.type !== "api_key") {
				return raw;
			}
			const auth = OpencodeAuthSchema.parse(raw ?? {});
			return { ...auth, [entry]: { ...auth[entry], type: "api", key: credential.key } };
		},
	};
}

const AUTH_FILES: Record<Provider, AuthFile> = {
	"openai-codex": {
		path: join(homedir(), ".codex", "auth.json"),
		parse(raw) {
			const auth = CodexAuthSchema.parse(raw);
			return {
				type: "oauth",
				access: auth.tokens.access_token,
				refresh: auth.tokens.refresh_token,
				expires: Date.parse(auth.last_refresh) + CODEX_TOKEN_LIFETIME_MS,
				accountId: auth.tokens.account_id,
			};
		},
		serialize(raw, credential) {
			if (credential.type !== "oauth") {
				return raw;
			}
			const auth = CodexAuthSchema.partial().parse(raw ?? {});
			return {
				auth_mode: "chatgpt",
				...auth,
				tokens: {
					...auth.tokens,
					access_token: credential.access,
					refresh_token: credential.refresh,
					account_id: credential.accountId,
				},
				last_refresh: new Date(credential.expires - CODEX_TOKEN_LIFETIME_MS).toISOString(),
			};
		},
	},
	opencode: opencodeAuthFile("opencode", "opencode-go"),
	"opencode-go": opencodeAuthFile("opencode-go", "opencode"),
};

const loaded = new Map<Provider, Credential>();

async function readRaw(file: AuthFile): Promise<unknown> {
	const raw = await readTextFile(file.path);
	if (raw === null) {
		return null;
	}
	return JSON.parse(raw);
}

async function readCredential(providerId: string): Promise<Credential | undefined> {
	const provider = ProviderSchema.safeParse(providerId);
	if (!provider.success) {
		return undefined;
	}
	const cached = loaded.get(provider.data);
	if (cached) {
		return cached;
	}
	const file = AUTH_FILES[provider.data];
	const raw = await readRaw(file);
	if (raw === null) {
		return undefined;
	}
	const credential = file.parse(raw);
	loaded.set(provider.data, credential);
	return credential;
}

async function persist(provider: Provider, credential: Credential): Promise<void> {
	const file = AUTH_FILES[provider];
	const raw = await readRaw(file);
	await writeTextFile(file.path, `${JSON.stringify(file.serialize(raw, credential), null, 2)}\n`, 0o600);
}

const credentials: CredentialStore = {
	read: readCredential,
	async list() {
		const entries = await Promise.all(ProviderSchema.options.map(async (providerId) => {
			const credential = await readCredential(providerId);
			if (!credential) {
				return [];
			}
			return [{ providerId, type: credential.type }];
		}));
		return entries.flat();
	},
	async modify(providerId, update) {
		const next = await update(await readCredential(providerId));
		const provider = ProviderSchema.safeParse(providerId);
		if (next && provider.success) {
			loaded.set(provider.data, next);
			await persist(provider.data, next);
		}
		return next;
	},
	async delete(providerId) {
		const provider = ProviderSchema.safeParse(providerId);
		if (provider.success) {
			loaded.delete(provider.data);
		}
	},
};

const catalogs: ModelsStore = {
	async read(provider) {
		return database().select().from(modelCatalogs).where(eq(modelCatalogs.provider, provider)).get()?.entry;
	},
	async write(provider, entry) {
		database().insert(modelCatalogs).values({ provider, entry }).onConflictDoUpdate({ target: modelCatalogs.provider, set: { entry } }).run();
	},
	async delete(provider) {
		database().delete(modelCatalogs).where(eq(modelCatalogs.provider, provider)).run();
	},
};

let registry: Models | null = null;

export function models(): Models {
	if (registry) {
		return registry;
	}
	const created = createModels({ credentials, modelsStore: catalogs });
	created.setProvider(withFreeTier(opencodeProvider()));
	created.setProvider(withCatalog(opencodeGoProvider()));
	created.setProvider(withLiveModels(openaiCodexProvider()));
	registry = created;
	return created;
}

function reportRefresh(result: ModelsRefreshResult): void {
	for (const [provider, error] of result.errors) {
		console.error(`Model list for ${provider} could not be refreshed`, error);
	}
}

export async function refreshModels(): Promise<void> {
	reportRefresh(await models().refresh({ allowNetwork: false }));
	void models().refresh().then(reportRefresh);
}

export function sessionOptions(model: Pick<Model<Api>, "provider">, sessionId: string) {
	const header = SESSION_HEADERS[model.provider];
	if (!header) {
		return { sessionId };
	}
	return { sessionId, headers: { [header]: sessionId } };
}
