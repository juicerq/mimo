import { createHash, randomBytes } from "node:crypto";
import { gmailClient, requestToken } from "./accounts";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

export const GMAIL_REDIRECT_URI = "http://127.0.0.1:53682/oauth2callback";

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

export async function exchangeAuthorizationCode(
	code: string,
	verifier: string,
): Promise<{ accessToken: string; refreshToken: string }> {
	const token = await requestToken({
		grant_type: "authorization_code",
		code,
		code_verifier: verifier,
		redirect_uri: GMAIL_REDIRECT_URI,
	});
	if (!token.refreshToken) {
		throw new Error(
			"O Google não devolveu um refresh token. Remova o acesso do app em https://myaccount.google.com/permissions e rode de novo.",
		);
	}
	return { accessToken: token.accessToken, refreshToken: token.refreshToken };
}
