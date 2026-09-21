import type { AgentTool } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import type { ToolContext } from "../tools/context";
import { tool } from "../tools/tool";
import { BROWSER_KEYS, type BrowserSession, type Page } from "./browser";

const BROWSE = "browse";

const BrowseInput = z.object({
	action: z.enum(["open", "look", "click", "fill", "press", "scroll", "handoff", "close"]).describe("O que fazer na página."),
	url: z.url().optional().describe("Para open: o endereço completo, com https://."),
	ref: z
		.string()
		.regex(/^e\d+$/u, "Use um ref como e12, copiado do último look.")
		.optional()
		.describe("Para click e fill: o ref do elemento, como e12."),
	text: z.string().max(20_000).optional().describe("Para fill: o texto que entra no campo, no lugar do que estiver lá."),
	key: z.enum(BROWSER_KEYS).optional().describe("Para press: a tecla."),
	direction: z.enum(["up", "down"]).optional().describe("Para scroll: o lado."),
	reason: z.string().min(1).max(500).optional().describe("Para handoff: o que você precisa que a pessoa faça, em uma frase."),
});

type Browse = z.output<typeof BrowseInput>;

type BrowseResult = Page | { helped: boolean } | { closed: true };

function need<T>(value: T | undefined, missing: string): T {
	if (value === undefined) {
		throw new Error(`Faltou ${missing} nesta ação.`);
	}
	return value;
}

async function run(session: BrowserSession, input: Browse, signal?: AbortSignal): Promise<BrowseResult> {
	if (input.action === "open") {
		return await session.open(need(input.url, "url"));
	}
	if (input.action === "click") {
		return await session.click(need(input.ref, "ref"));
	}
	if (input.action === "fill") {
		return await session.fill(need(input.ref, "ref"), need(input.text, "text"));
	}
	if (input.action === "press") {
		return await session.press(need(input.key, "key"));
	}
	if (input.action === "scroll") {
		return await session.scroll(need(input.direction, "direction"));
	}
	if (input.action === "handoff") {
		return await session.handoff(need(input.reason, "reason"), signal);
	}
	if (input.action === "close") {
		session.close();
		return { closed: true };
	}
	return await session.look();
}

export function browserTools(context: ToolContext): AgentTool[] {
	return [
		tool({
			name: BROWSE,
			description:
				"Usa um navegador que a pessoa vê. Toda ação devolve a página em texto, com um ref por elemento que aceita clique. Comece com open, leia o resultado e use os refs do último look. Quando a página pedir login, um código, ou qualquer coisa que só a pessoa pode fazer, chame handoff em vez de tentar sozinho.",
			input: BrowseInput,
			async execute(input, signal) {
				return await run(context.browser(), input, signal);
			},
		}),
	];
}
