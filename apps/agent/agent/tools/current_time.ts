import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
	description: "Retorna a data e a hora atuais.",
	inputSchema: z.object({}),
	async execute() {
		return { now: new Date().toISOString() };
	},
});
