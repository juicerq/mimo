import { defineTool } from "eve/tools";
import { z } from "zod";
import { botMode } from "../lib/mode";

export default defineTool({
	description:
		"Alterna o modo do bot nesta conversa. No normal, os envios pedem aprovação no terminal; no autônomo, enviam sem perguntar e ficam registrados. Use só a pedido explícito do usuário.",
	inputSchema: z.object({
		mode: z.enum(["normal", "autonomous"]).describe("Modo desejado."),
	}),
	approval: ({ toolInput }) => {
		if (toolInput?.mode !== "autonomous" || botMode.get() !== "normal") {
			return "not-applicable";
		}
		return "user-approval";
	},
	async execute({ mode }) {
		const previous = botMode.get();
		botMode.update(() => mode);
		return { previous, mode };
	},
});
