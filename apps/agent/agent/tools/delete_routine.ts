import { defineTool } from "eve/tools";
import { z } from "zod";
import { approveInNormalMode } from "../lib/mode";
import { deleteRoutine } from "../lib/routines";

export default defineTool({
	description: "Apaga uma rotina. No modo normal, a chamada espera aprovação no terminal.",
	inputSchema: z.object({
		id: z.string().min(1).describe("O id da rotina, como veio de list_routines."),
	}),
	approval: approveInNormalMode,
	async execute({ id }) {
		if (!(await deleteRoutine(id))) {
			throw new Error(`Rotina ${id} não encontrada.`);
		}
		return { deleted: id };
	},
});
