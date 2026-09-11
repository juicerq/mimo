import { defineTool } from "eve/tools";
import { currentBotId } from "../lib/bots";
import { z } from "zod";
import { listRoutines, routineView } from "../lib/routines";

export default defineTool({
	description: "Lista as rotinas, com intervalo, próximo disparo, último disparo e último erro.",
	inputSchema: z.object({}),
	async execute() {
		const routines = await listRoutines(currentBotId());
		return { routines: routines.map(routineView) };
	},
});
