import { defineTool } from "eve/tools";
import { z } from "zod";
import { routineView, updateRoutine } from "../lib/routines";

export default defineTool({
	description: "Edita o prompt, o intervalo ou o estado de uma rotina existente.",
	inputSchema: z.object({
		id: z.string().min(1).describe("O id da rotina, como veio de list_routines."),
		prompt: z.string().min(1).max(8000).optional().describe("Novo texto do que o bot deve fazer."),
		everyMinutes: z.number().int().min(1).max(10_080).optional().describe("Novo intervalo, em minutos."),
		enabled: z.boolean().optional().describe("Liga ou desliga a rotina."),
	}),
	async execute({ id, ...patch }) {
		return routineView(await updateRoutine(id, patch));
	},
});
