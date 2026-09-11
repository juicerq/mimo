import { createModels, type Credential, type CredentialStore, type Models } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { ProviderSchema, type Provider } from "./types";

const CodexAuthSchema = z
	.object({
		tokens: z.object({
			access_token: z.string().min(1),
			refresh_token: z.string().min(1),
			account_id: z.string().min(1),
		}),
		last_refresh: z.string().min(1),
	})
	.transform((auth): Credential => ({
		type: "oauth",
		access: auth.tokens.access_token,
		refresh: auth.tokens.refresh_token,
		expires: Date.parse(auth.last_refresh) + 3_600_000,
		accountId: auth.tokens.account_id,
	}));

const OpencodeAuthSchema = z
	.object({ "opencode-go": z.object({ key: z.string().min(1) }) })
	.transform((auth): Credential => ({ type: "api_key", key: auth["opencode-go"].key }));

const AUTH_FILES: Record<Provider, { path: string; schema: z.ZodType<Credential, unknown> }> = {
	"openai-codex": { path: join(homedir(), ".codex", "auth.json"), schema: CodexAuthSchema },
	"opencode-go": { path: join(homedir(), ".local", "share", "opencode", "auth.json"), schema: OpencodeAuthSchema },
};

const loaded = new Map<Provider, Credential>();

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
	const raw = await readFile(file.path, "utf8").catch(() => null);
	if (raw === null) {
		return undefined;
	}
	const credential = file.schema.parse(JSON.parse(raw));
	loaded.set(provider.data, credential);
	return credential;
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
	created.setProvider(opencodeGoProvider());
	created.setProvider(openaiCodexProvider());
	registry = created;
	return created;
}
