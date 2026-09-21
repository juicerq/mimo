import { z } from "zod";
import { tool } from "../tools/tool";

const SPEAK = "send_message";

const SpeakInput = z.object({
	text: z.string().trim().min(1).describe("O que a pessoa vai ler, em markdown."),
	done: z.boolean().default(false).describe("true quando esta é a última mensagem do turno: o turno termina aqui. Deixe false para dar notícia e continuar trabalhando."),
});

export function isSpeech(toolName: string): boolean {
	return toolName === SPEAK;
}

export function spokenText(toolName: string, input: unknown): string | null {
	if (!isSpeech(toolName)) {
		return null;
	}
	return SpeakInput.safeParse(input).data?.text ?? null;
}

export const speechTool = tool({
	name: SPEAK,
	description: "Manda uma mensagem para a pessoa. É o único canal com ela: texto fora desta tool, inclusive o comentário ao lado de outra tool, é descartado sem ela ver. Use para dizer o que vai fazer, para contar cada achado durante o trabalho, chamando junto com a próxima tool, e para a resposta final com done: true.",
	input: SpeakInput,
	ends: (input) => input.done,
	async execute() {
		return { sent: true };
	},
});
