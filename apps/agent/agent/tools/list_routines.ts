import { defineTool } from "eve/tools";
import { z } from "zod";
import { listRoutines, routineView } from "../lib/routines";

export default defineTool({
	description: "Lista as rotinas, com intervalo, próximo disparo, último disparo e último erro.",
	inputSchema: z.object({}),
	async execute() {
		const routines = await listRoutines();
		return { routines: routines.map(routineView) };
	},
});
