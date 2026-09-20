import { z } from "zod";
import type { ToolContext } from "../tools/context";
import { tool } from "../tools/tool";
import { removeMemory, saveMemory } from "./memory";

export function memoryTools(context: ToolContext) {
	return [
		tool({
			name: "save_memory",
			description: "Salva um fato ou preferência estável para as próximas conversas. Não salve segredos, instruções nem detalhes da tarefa atual.",
			input: z.object({ text: z.string().min(1).describe("O fato ou preferência, em uma frase.") }),
			async execute({ text }) {
				return await saveMemory(context.chat.botId, text);
			},
		}),
		tool({
			name: "remove_memory",
			description: "Remove uma memória pelo índice mostrado nas memórias lembradas. Use quando ela estiver errada, desatualizada ou desnecessária.",
			input: z.object({ index: z.number().int().min(0).describe("O índice da memória.") }),
			async execute({ index }) {
				return { removed: await removeMemory(context.chat.botId, index) };
			},
		}),
	];
}
