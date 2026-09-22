import type { ToolContext } from "../tools/context";
import { z } from "zod";
import { tool } from "../tools/tool";

const SPEAK = "send_message";

const SpeakInput = z.object({
	text: z.string().trim().min(1).describe("O que a pessoa vai ler, em markdown."),
	done: z.boolean().describe("true se esta é a resposta final: o turno termina depois desta resposta. false se é uma notícia no meio do trabalho, e você ainda vai chamar mais tools."),
});

export function isSpeech(toolName: string): boolean {
	return toolName === SPEAK;
}

export function speechTool(context: ToolContext) {
	return tool({
		name: SPEAK,
		description: "Manda uma mensagem para a pessoa. É o único canal com ela: texto fora desta tool, inclusive o comentário ao lado de outra tool, é descartado sem ela ver. Use para dizer o que vai fazer, para dar notícia quando algo muda durante o trabalho, chamando junto com a próxima tool, e para a resposta final, com done: true.",
		input: SpeakInput,
		async execute(input, _signal, id) {
			if (!id) {
				throw new Error("Esta fala não tem identificação.");
			}
			return context.speak({ ...input, id });
		},
	});
}
