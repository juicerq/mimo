import { z } from "zod";
import { recordAction, recordFailure } from "../actions/actions";
import type { ToolContext } from "../tools/context";
import { tool } from "../tools/tool";
import { createRoutine, deleteRoutine, listRoutines, RoutineNameSchema, routineView, updateRoutine } from "./routines";

export function routineTools(context: ToolContext) {
	return [
		tool({
			name: "create_routine",
			description: "Cria uma rotina que dispara o bot de tempos em tempos; o resultado chega nesta conversa.",
			input: z.object({
				name: RoutineNameSchema.describe("Nome curto da rotina, como check_emails. Letras, números, _ e - apenas."),
				prompt: z.string().min(1).max(8_000).describe("O que o bot deve fazer em cada disparo."),
				everyMinutes: z.number().int().min(1).max(10_080).describe("Intervalo entre disparos, em minutos."),
				startInMinutes: z.number().int().min(0).max(10_080).optional()
					.describe("Minutos até o primeiro disparo. Sem isso, usa o intervalo."),
			}),
			async execute({ name, prompt, everyMinutes, startInMinutes }) {
				return routineView(await createRoutine({
					name,
					prompt,
					everyMinutes,
					startInMinutes: startInMinutes ?? everyMinutes,
					botId: context.botId,
					sessionId: context.sessionId,
				}));
			},
		}),
		tool({
			name: "list_routines",
			description: "Lista as rotinas, com nome, intervalo, próximo disparo, último disparo e último erro.",
			input: z.object({}),
			async execute() {
				const routines = await listRoutines(context.botId);
				return { routines: routines.map(routineView) };
			},
		}),
		tool({
			name: "update_routine",
			description: "Edita o nome, o prompt, o intervalo ou o estado de uma rotina existente.",
			input: z.object({
				routine: RoutineNameSchema.describe("O nome da rotina."),
				name: RoutineNameSchema.optional().describe("Novo nome da rotina."),
				prompt: z.string().min(1).max(8_000).optional().describe("Novo texto do que o bot deve fazer."),
				everyMinutes: z.number().int().min(1).max(10_080).optional().describe("Novo intervalo, em minutos."),
				enabled: z.boolean().optional().describe("Liga ou desliga a rotina."),
			}),
			async execute({ routine, ...patch }) {
				return routineView(await updateRoutine({ name: routine, botId: context.botId }, patch));
			},
		}),
		tool({
			name: "delete_routine",
			description: "Apaga uma rotina. No modo normal, a chamada espera aprovação no terminal.",
			input: z.object({
				routine: RoutineNameSchema.describe("O nome da rotina."),
			}),
			async execute({ routine }) {
				const base = {
					kind: "delete_routine" as const,
					mode: context.mode,
					sessionId: context.sessionId,
					summary: `rotina ${routine}`,
					detail: { routine },
				};
				try {
					if (!(await deleteRoutine({ name: routine, botId: context.botId }))) {
						throw new Error(`Você não tem uma rotina chamada ${routine}.`);
					}
					await recordAction(base);
					return { deleted: routine };
				} catch (error) {
					await recordFailure(base, error).catch(() => {});
					throw error;
				}
			},
		}),
	];
}
