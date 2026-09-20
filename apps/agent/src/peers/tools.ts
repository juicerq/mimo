import type { AgentTool } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import { listBots } from "../bot/store";
import type { BotEvent } from "../bot/types";
import type { ToolContext } from "../tools/context";
import { parseJson, tool } from "../tools/tool";

const ASK = "ask_bot";

const AskInput = z.object({
	bot: z.string().trim().min(1).max(80).describe("O nome do outro bot."),
	prompt: z.string().min(1).describe("A pergunta inteira, com tudo o que ele precisa saber."),
	wait: z.boolean().default(false).describe("true segura o turno até ele responder. Deixe false para continuar a conversa e receber a resposta depois."),
});

const AskedCall = z.object({ bot: z.string(), prompt: z.string() });
const AskedResult = z.object({ bot: z.string(), reply: z.string() });

export function isAsk(toolName: string): boolean {
	return toolName === ASK;
}

export function askedEvent(toolName: string, id: string, input: unknown): BotEvent | null {
	if (!isAsk(toolName)) {
		return null;
	}
	const parsed = AskedCall.safeParse(input);
	if (!parsed.success) {
		return null;
	}
	return { type: "asked", id, peer: parsed.data.bot, prompt: parsed.data.prompt };
}

export function answeredEvent(output: string): BotEvent | null {
	const parsed = AskedResult.safeParse(parseJson(output));
	if (!parsed.success) {
		return null;
	}
	return { type: "answered", peer: parsed.data.bot, text: parsed.data.reply, failed: false };
}

export function peerTools(context: ToolContext): AgentTool[] {
	return [
		tool({
			name: "list_bots",
			description: "Lista os outros bots da pessoa, com a instrução de cada um.",
			input: z.object({}),
			async execute() {
				return (await listBots())
					.filter((bot) => bot.id !== context.chat.botId)
					.map((bot) => ({ name: bot.name, instruction: bot.prompt ?? null }));
			},
		}),
		tool({
			name: ASK,
			description: "Pergunta a outro bot da pessoa. Vocês dois têm uma conversa à parte: ele não enxerga esta aqui, então escreva a pergunta inteira.",
			input: AskInput,
			async execute(input, signal) {
				return await context.ask(input, signal);
			},
		}),
	];
}
