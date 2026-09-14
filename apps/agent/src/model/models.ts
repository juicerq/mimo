import { createModels, type Credential, type CredentialStore, type Models } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { readTextFile, writeTextFile } from "../storage/files";
import { homePath } from "../storage/home";
import { clineProvider } from "./cline";
import { withCatalog } from "./overlay";
import { ProviderSchema, type Provider } from "./types";

const CODEX_TOKEN_LIFETIME_MS = 3_600_000;

const CodexAuthSchema = z.looseObject({
	tokens: z.looseObject({
		access_token: z.string().min(1),
		refresh_token: z.string().min(1),
		account_id: z.string().min(1),
	}),
	last_refresh: z.string().min(1),
});

const OpencodeAuthSchema = z.looseObject({
	"opencode-go": z.looseObject({ key: z.string().min(1) }),
});

const ClineAuthSchema = z.looseObject({
	cline: z.looseObject({ key: z.string().min(1) }),
});

interface AuthFile {
	path: string;
	parse(raw: unknown): Credential;
	serialize(raw: unknown, credential: Credential): unknown;
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
	"opencode-go": {
		path: join(homedir(), ".local", "share", "opencode", "auth.json"),
		parse(raw) {
			return { type: "api_key", key: OpencodeAuthSchema.parse(raw)["opencode-go"].key };
		},
		serialize(raw, credential) {
			if (credential.type !== "api_key") {
				return raw;
			}
			const auth = OpencodeAuthSchema.partial().parse(raw ?? {});
			return { ...auth, "opencode-go": { ...auth["opencode-go"], type: "api", key: credential.key } };
		},
	},
	cline: {
		path: homePath("providers.json"),
		parse(raw) {
			return { type: "api_key", key: ClineAuthSchema.parse(raw).cline.key };
		},
		serialize(raw, credential) {
			if (credential.type !== "api_key") {
				return raw;
			}
			const auth = ClineAuthSchema.partial().parse(raw ?? {});
			return { ...auth, cline: { ...auth.cline, type: "api", key: credential.key } };
		},
	},
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

let registry: Models | null = null;

export function models(): Models {
	if (registry) {
		return registry;
	}
	const created = createModels({ credentials });
	created.setProvider(withCatalog(opencodeGoProvider()));
	created.setProvider(openaiCodexProvider());
	created.setProvider(clineProvider());
	registry = created;
	return created;
}
