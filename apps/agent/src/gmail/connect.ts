import { randomUUID } from "node:crypto";
import type { AuthInteraction } from "@earendil-works/pi-ai";
import { saveAccount } from "./accounts";
import { fetchAccountEmail } from "./api";
import { GMAIL_REDIRECT_URI, authorizationUrl, createPkce, exchangeAuthorizationCode } from "./oauth";

const DONE_PAGE = "<h1>Pronto</h1><p>Pode fechar esta aba e voltar ao Mimo.</p>";

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
				return new Response("não encontrado", { status: 404 });
			}
			const error = url.searchParams.get("error");
			if (error !== null) {
				return new Response(`Autorização recusada: ${error}`, { status: 400 });
			}
			const received = url.searchParams.get("code");
			if (received === null) {
				return new Response("código ausente", { status: 400 });
			}
			deliver(received);
			return new Response(DONE_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
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
