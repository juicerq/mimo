import { randomUUID } from "node:crypto";
import {
	GMAIL_REDIRECT_URI,
	authorizationUrl,
	createPkce,
	exchangeAuthorizationCode,
} from "../agent/lib/gmail/oauth";

try {
	const redirect = new URL(GMAIL_REDIRECT_URI);
	const { verifier, challenge } = createPkce();
	const state = randomUUID();
	const url = authorizationUrl(state, challenge);

	const server = Bun.serve({
		hostname: redirect.hostname,
		port: Number(redirect.port),
		async fetch(request) {
			const requestUrl = new URL(request.url);
			if (requestUrl.pathname !== redirect.pathname) {
				return new Response("não encontrado", { status: 404 });
			}
			if (requestUrl.searchParams.get("state") !== state) {
				return new Response("state inválido", { status: 400 });
			}
			const error = requestUrl.searchParams.get("error");
			if (error) {
				console.error(`\nautorização recusada: ${error}`);
				void server.stop();
				return new Response(`Autorização recusada: ${error}`, { status: 400 });
			}
			const code = requestUrl.searchParams.get("code");
			if (code === null) {
				return new Response("código ausente", { status: 400 });
			}
			try {
				const refreshToken = await exchangeAuthorizationCode(code, verifier);
				console.log("\nPronto. Cole a linha abaixo em apps/agent/.env.local:\n");
				console.log(`GMAIL_REFRESH_TOKEN=${refreshToken}`);
				return new Response("<h1>Pronto</h1><p>Pode fechar esta aba e voltar ao terminal.</p>", {
					headers: { "content-type": "text/html; charset=utf-8" },
				});
			} catch (exchangeError) {
				console.error(exchangeError instanceof Error ? exchangeError.message : exchangeError);
				return new Response("Falha ao trocar o código. Veja o terminal.", { status: 500 });
			} finally {
				void server.stop();
			}
		},
	});

	console.log("Abra esta URL no navegador:\n");
	console.log(url);
	console.log(`\nAguardando a autorização em ${GMAIL_REDIRECT_URI} ...`);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
