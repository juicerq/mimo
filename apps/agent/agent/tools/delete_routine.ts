import { defineTool } from "eve/tools";
import { z } from "zod";
import { recordAction, recordFailure } from "../lib/actions";
import { approveInNormalMode, botMode } from "../lib/mode";
import { deleteRoutine } from "../lib/routines";

export default defineTool({
	description: "Apaga uma rotina. No modo normal, a chamada espera aprovação no terminal.",
	inputSchema: z.object({
		id: z.string().min(1).describe("O id da rotina, como veio de list_routines."),
	}),
	approval: approveInNormalMode,
	async execute({ id }, ctx) {
		const base = {
			kind: "delete_routine" as const,
			mode: botMode.get(),
			sessionId: ctx.session.id,
			summary: `rotina ${id}`,
			detail: { routineId: id },
		};
		try {
			if (!(await deleteRoutine(id))) {
				throw new Error(`Rotina ${id} não encontrada.`);
			}
			await recordAction(base);
			return { deleted: id };
		} catch (error) {
			await recordFailure(base, error).catch(() => {});
			throw error;
		}
	},
});
