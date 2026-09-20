import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
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

interface Page {
	heading: string;
	detail: string;
	status: number;
}

function pageHtml(page: Page): string {
	return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">`
		+ `<meta name="viewport" content="width=device-width,initial-scale=1">`
		+ `<title>mimo</title><style>${PAGE_STYLE}</style></head>`
		+ `<body><main><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.detail)}</p></main></body></html>`;
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

function callbackPage(url: URL, state: string, deliver: (code: string) => void): Page {
	const redirect = new URL(GMAIL_REDIRECT_URI);
	if (url.pathname !== redirect.pathname || url.searchParams.get("state") !== state) {
		return { heading: "Link inválido", detail: "Volte ao Mimo e abra o link de autorização de novo.", status: 404 };
	}
	const error = url.searchParams.get("error");
	if (error !== null) {
		return { heading: "Autorização recusada", detail: error, status: 400 };
	}
	const received = url.searchParams.get("code");
	if (received === null) {
		return { heading: "Link inválido", detail: "O Google não devolveu o código de autorização.", status: 400 };
	}
	deliver(received);
	return { heading: "Conta conectada", detail: "Pode fechar esta aba e voltar ao Mimo.", status: 200 };
}

async function serveCallback(state: string): Promise<{ code: Promise<string>; stop: () => void }> {
	const redirect = new URL(GMAIL_REDIRECT_URI);
	let deliver: (code: string) => void = () => {};
	const code = new Promise<string>((resolve) => {
		deliver = resolve;
	});
	const server = createServer((request, response) => {
		const page = callbackPage(new URL(request.url ?? "/", redirect), state, deliver);
		response.writeHead(page.status, { "content-type": "text/html; charset=utf-8" });
		response.end(pageHtml(page));
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(Number(redirect.port), redirect.hostname, resolve);
	});

	return {
		code,
		stop: () => {
			server.close();
			server.closeAllConnections();
		},
	};
}

export async function connectGmail(interaction: AuthInteraction): Promise<string> {
	const { verifier, challenge } = createPkce();
	const state = randomUUID();
	const callback = await serveCallback(state);

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
		return email;
	} finally {
		callback.stop();
	}
}
