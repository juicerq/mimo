import { z } from "zod";
import { dataPath } from "../storage/home";
import { readJsonFile, writeTextFile } from "../storage/files";

const STORE_PATH = dataPath("gmail", "accounts.json");
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const REFRESH_SKEW_MS = 60_000;

const accountSchema = z.object({
	email: z.string().min(1),
	refreshToken: z.string().min(1),
});

const storeSchema = z.object({
	accounts: z.array(accountSchema),
});

const tokenResponseSchema = z.object({
	access_token: z.string(),
	expires_in: z.number(),
	refresh_token: z.string().optional(),
});

export type GmailAccount = z.infer<typeof accountSchema>;

export const accountField = z
	.string()
	.optional()
	.describe("E-mail da conta conectada. Use list_accounts para ver as opções.");

export interface GmailClient {
	clientId: string;
	clientSecret: string;
}

export interface TokenGrant {
	accessToken: string;
	expiresIn: number;
	refreshToken: string | undefined;
}

interface CachedToken {
	accessToken: string;
	expiresAt: number;
}

const cachedTokens = new Map<string, CachedToken>();
const pendingRefreshes = new Map<string, Promise<CachedToken>>();

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(
			`Gmail não está configurado: defina ${name} em ~/.mimo/.env. Veja .env.example.`,
		);
	}
	return value;
}

export function gmailClient(): GmailClient {
	return {
		clientId: requiredEnv("GMAIL_CLIENT_ID"),
		clientSecret: requiredEnv("GMAIL_CLIENT_SECRET"),
	};
}

export async function requestToken(grant: Record<string, string>): Promise<TokenGrant> {
	const { clientId, clientSecret } = gmailClient();
	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...grant }),
	});
	if (!response.ok) {
		throw new Error(
			`O Google recusou a requisição de token (${response.status}): ${(await response.text()).slice(0, 300)}`,
		);
	}
	const token = tokenResponseSchema.parse(await response.json());
	return { accessToken: token.access_token, expiresIn: token.expires_in, refreshToken: token.refresh_token };
}

export async function listAccounts(): Promise<GmailAccount[]> {
	const store = await readJsonFile(STORE_PATH, storeSchema);
	return store?.accounts ?? [];
}

export async function saveAccount(account: GmailAccount): Promise<void> {
	const accounts = await listAccounts();
	const updated = [...accounts.filter((existing) => existing.email !== account.email), account];
	await writeTextFile(STORE_PATH, `${JSON.stringify({ accounts: updated }, null, "\t")}\n`, 0o600);
}

export async function disconnectAccount(email?: string): Promise<{ email: string; revoked: boolean }> {
	const account = await resolveAccount(email);
	const accounts = await listAccounts();
	await writeTextFile(
		STORE_PATH,
		`${JSON.stringify({ accounts: accounts.filter((existing) => existing.email !== account.email) }, null, "\t")}\n`,
		0o600,
	);
	cachedTokens.delete(account.email);
	const revoked = await fetch(`${REVOKE_URL}?token=${encodeURIComponent(account.refreshToken)}`, { method: "POST" })
		.then((response) => response.ok)
		.catch(() => false);

	return { email: account.email, revoked };
}

function accountList(accounts: GmailAccount[]): string {
	return accounts.map((account) => account.email).join(", ");
}

export async function resolveAccount(query?: string): Promise<GmailAccount> {
	const accounts = await listAccounts();
	if (query) {
		const wanted = query.toLowerCase();
		const found = accounts.find((account) => account.email.toLowerCase() === wanted);
		if (found) {
			return found;
		}
		throw new Error(`Conta "${query}" não encontrada. Conectadas: ${accountList(accounts)}.`);
	}
	if (accounts.length === 0) {
		throw new Error("Nenhuma conta do Gmail conectada. Chame connect_gmail para conectar uma.");
	}
	if (accounts.length > 1) {
		throw new Error(`Mais de uma conta conectada: ${accountList(accounts)}. Informe qual no parâmetro account.`);
	}
	return accounts[0];
}

async function refreshAccessToken(account: GmailAccount): Promise<CachedToken> {
	const token = await requestToken({ grant_type: "refresh_token", refresh_token: account.refreshToken });
	return { accessToken: token.accessToken, expiresAt: Date.now() + token.expiresIn * 1000 };
}

export async function accessToken(account: GmailAccount): Promise<string> {
	const cached = cachedTokens.get(account.email);
	if (cached && cached.expiresAt - REFRESH_SKEW_MS > Date.now()) {
		return cached.accessToken;
	}
	const pending = pendingRefreshes.get(account.email) ?? refreshAccessToken(account);
	pendingRefreshes.set(account.email, pending);
	try {
		const token = await pending;
		cachedTokens.set(account.email, token);
		return token.accessToken;
	} finally {
		pendingRefreshes.delete(account.email);
	}
}
