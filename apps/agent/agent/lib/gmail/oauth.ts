import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const REFRESH_SKEW_MS = 60_000;

export const GMAIL_REDIRECT_URI = "http://127.0.0.1:53682/oauth2callback";

const tokenResponseSchema = z.object({
	access_token: z.string(),
	expires_in: z.number(),
});

const codeResponseSchema = tokenResponseSchema.extend({
	refresh_token: z.string().optional(),
});

interface GmailClient {
	clientId: string;
	clientSecret: string;
}

interface CachedToken {
	accessToken: string;
	expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let refreshing: Promise<CachedToken> | null = null;

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(
			`Gmail não está configurado: defina ${name} em apps/agent/.env.local. Veja apps/agent/.env.example e rode \`bun run gmail:auth\`.`,
		);
	}
	return value;
}

function gmailClient(): GmailClient {
	return {
		clientId: requiredEnv("GMAIL_CLIENT_ID"),
		clientSecret: requiredEnv("GMAIL_CLIENT_SECRET"),
	};
}

async function errorText(response: Response): Promise<string> {
	return (await response.text()).slice(0, 300);
}

export function createPkce(): { verifier: string; challenge: string } {
	const verifier = randomBytes(32).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	return { verifier, challenge };
}

export function authorizationUrl(state: string, challenge: string): string {
	const { clientId } = gmailClient();
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: GMAIL_REDIRECT_URI,
		response_type: "code",
		scope: SCOPES.join(" "),
		access_type: "offline",
		prompt: "consent",
		state,
		code_challenge: challenge,
		code_challenge_method: "S256",
	});
	return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeAuthorizationCode(code: string, verifier: string): Promise<string> {
	const { clientId, clientSecret } = gmailClient();
	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			code_verifier: verifier,
			grant_type: "authorization_code",
			redirect_uri: GMAIL_REDIRECT_URI,
		}),
	});
	if (!response.ok) {
		throw new Error(`Falha ao trocar o código de autorização (${response.status}): ${await errorText(response)}`);
	}
	const token = codeResponseSchema.parse(await response.json());
	if (!token.refresh_token) {
		throw new Error(
			"O Google não devolveu um refresh token. Remova o acesso do app em https://myaccount.google.com/permissions e rode de novo.",
		);
	}
	return token.refresh_token;
}

async function refreshAccessToken(): Promise<CachedToken> {
	const { clientId, clientSecret } = gmailClient();
	const refreshToken = requiredEnv("GMAIL_REFRESH_TOKEN");
	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}),
	});
	if (!response.ok) {
		throw new Error(
			`Falha ao renovar o acesso ao Gmail (${response.status}): ${await errorText(response)} Se o token expirou, rode \`bun run gmail:auth\` de novo.`,
		);
	}
	const token = tokenResponseSchema.parse(await response.json());
	return { accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
}

export async function gmailAccessToken(): Promise<string> {
	if (cachedToken && cachedToken.expiresAt - REFRESH_SKEW_MS > Date.now()) {
		return cachedToken.accessToken;
	}
	refreshing ??= refreshAccessToken();
	try {
		cachedToken = await refreshing;
		return cachedToken.accessToken;
	} finally {
		refreshing = null;
	}
}
