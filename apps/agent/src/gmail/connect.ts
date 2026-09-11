import { randomUUID } from "node:crypto";
import type { AuthInteraction } from "@earendil-works/pi-ai";
import { saveAccount } from "./accounts";
import { fetchAccountEmail } from "./api";
import { GMAIL_REDIRECT_URI, authorizationUrl, createPkce, exchangeAuthorizationCode } from "./oauth";

const PAGE_STYLE = [
	"*{margin:0;padding:0;box-sizing:border-box}",
	"html,body{height:100%}",
	"body{display:flex;align-items:center;justify-content:center;background:#0B0B0C;color:#C9C9CC;",
	"font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}",
	"main{max-width:34rem;padding:2rem;text-align:center}",
	"h1{font-size:14px;font-weight:400;color:#F2F2F3;letter-spacing:.02em}",
	"p{margin-top:.75rem;color:#6B6B6F}",
].join("");

function escapeHtml(text: string): string {
	return text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
}

function page(heading: string, detail: string, status = 200): Response {
	const body = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">`
		+ `<meta name="viewport" content="width=device-width,initial-scale=1">`
		+ `<title>mimo</title><style>${PAGE_STYLE}</style></head>`
		+ `<body><main><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(detail)}</p></main></body></html>`;

	return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function authorizationCode(answer: string): string {
	const trimmed = answer.trim();
	if (!trimmed.startsWith("http")) {
		return trimmed;
	}
	const code = new URL(trimmed).searchParams.get("code");
	if (code === null) {
		throw new Error("A URL colada não tem o parâmetro code.");
	}
	return code;
}

function serveCallback(state: string): { code: Promise<string>; stop: () => void } {
	const redirect = new URL(GMAIL_REDIRECT_URI);
	let deliver: (code: string) => void = () => {};
	const code = new Promise<string>((resolve) => {
		deliver = resolve;
	});
	const server = Bun.serve({
		hostname: redirect.hostname,
		port: Number(redirect.port),
		fetch(request) {
			const url = new URL(request.url);
			if (url.pathname !== redirect.pathname || url.searchParams.get("state") !== state) {
				return page("Link inválido", "Volte ao Mimo e abra o link de autorização de novo.", 404);
			}
			const error = url.searchParams.get("error");
			if (error !== null) {
				return page("Autorização recusada", error, 400);
			}
			const received = url.searchParams.get("code");
			if (received === null) {
				return page("Link inválido", "O Google não devolveu o código de autorização.", 400);
			}
			deliver(received);
			return page("Conta conectada", "Pode fechar esta aba e voltar ao Mimo.");
		},
	});

	return { code, stop: () => void server.stop(true) };
}

export async function connectGmail(interaction: AuthInteraction): Promise<void> {
	const { verifier, challenge } = createPkce();
	const state = randomUUID();
	const callback = serveCallback(state);

	try {
		interaction.notify({
			type: "auth_url",
			url: authorizationUrl(state, challenge),
			instructions: "Abra o link e autorize a conta. A autorização volta sozinha para o Mimo.",
		});
		const answer = await Promise.race([
			callback.code,
			interaction.prompt({
				type: "text",
				message: "Ou cole aqui o código de autorização ou a URL de redirecionamento:",
				signal: interaction.signal,
			}),
		]);
		const tokens = await exchangeAuthorizationCode(authorizationCode(answer), verifier);
		const email = await fetchAccountEmail(tokens.accessToken);
		await saveAccount({ email, refreshToken: tokens.refreshToken });
		interaction.notify({ type: "info", message: `Conta ${email} conectada.` });
	} finally {
		callback.stop();
	}
}
