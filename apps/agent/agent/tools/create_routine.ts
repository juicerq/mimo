import { defineTool } from "eve/tools";
import { z } from "zod";
import { createRoutine, routineView } from "../lib/routines";

export default defineTool({
	description: "Cria uma rotina que dispara o bot de tempos em tempos; o resultado chega nesta conversa.",
	inputSchema: z.object({
		prompt: z.string().min(1).max(8000).describe("O que o bot deve fazer em cada disparo."),
		everyMinutes: z.number().int().min(1).max(10_080).describe("Intervalo entre disparos, em minutos."),
		startInMinutes: z
			.number()
			.int()
			.min(0)
			.max(10_080)
			.optional()
			.describe("Minutos até o primeiro disparo. Sem isso, usa o intervalo."),
	}),
	async execute({ prompt, everyMinutes, startInMinutes }, ctx) {
		const routine = await createRoutine({
			prompt,
			everyMinutes,
			startInMinutes: startInMinutes ?? everyMinutes,
			sessionId: ctx.session.id,
		});
		return routineView(routine);
	},
});
