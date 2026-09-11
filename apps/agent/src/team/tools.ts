import type { AgentTool } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import { createBot, listChildren, type BotPatch } from "../bot/store";
import { BotNameSchema, BotPromptSchema, ToolGroupSchema, type BotInfo } from "../bot/types";
import { listModels, selectModel } from "../model/catalog";
import { ModelSelectionSchema } from "../model/types";
import type { ToolContext } from "../tools/context";
import { tool } from "../tools/tool";

const NameInput = z.string().describe("Nome curto do filho.").pipe(BotNameSchema);
const PromptInput = BotPromptSchema.describe("Instrução permanente do filho, escrita sem depender desta conversa.");
const ToolsInput = z.array(ToolGroupSchema).min(1).describe("Grupos de tools liberados para o filho.");
const ModelInput = ModelSelectionSchema.describe("Modelo do filho. Veja os valores em list_models.");

const CreateBotInput = z.object({
	name: NameInput,
	prompt: PromptInput,
	tools: ToolsInput.optional(),
	model: ModelInput.optional(),
});

const UpdateBotInput = z.object({
	botId: z.uuid().describe("Id do filho."),
	name: NameInput.optional(),
	prompt: PromptInput.optional(),
	tools: ToolsInput.optional(),
	model: ModelInput.optional(),
});

const DeleteBotInput = z.object({ botId: z.uuid().describe("Id do filho.") });

function botView(bot: BotInfo) {
	return {
		id: bot.id,
		name: bot.name,
		prompt: bot.prompt ?? null,
		tools: bot.tools,
		model: `${bot.model.provider}/${bot.model.id}`,
		reasoning: bot.model.reasoning,
	};
}

function botPatch(input: z.output<typeof UpdateBotInput>): BotPatch {
	return {
		...input.name && { name: input.name },
		...input.prompt && { prompt: input.prompt },
		...input.tools && { tools: input.tools },
		...input.model && { model: selectModel(input.model) },
	};
}

export function teamTools(context: ToolContext): AgentTool[] {
	return [
		tool({
			name: "create_bot",
			description: "Cria um bot filho com instrução, tools e modelo próprios. Ele pertence a você e não aparece na lista da pessoa.",
			input: CreateBotInput,
			async execute({ model, ...draft }) {
				return botView(await createBot({
					...draft,
					parentId: context.botId,
					...model && { model: selectModel(model) },
				}));
			},
		}),
		tool({
			name: "update_bot",
			description: "Muda o nome, a instrução, as tools ou o modelo de um filho. Só os campos enviados mudam.",
			input: UpdateBotInput,
			async execute(input) {
				return botView(await context.updateChild(input.botId, botPatch(input)));
			},
		}),
		tool({
			name: "list_bots",
			description: "Lista os filhos desta equipe com a instrução, as tools e o modelo de cada um.",
			input: z.object({}),
			async execute() {
				return (await listChildren(context.botId)).map(botView);
			},
		}),
		tool({
			name: "delete_bot",
			description: "Apaga um filho com a memória e as rotinas dele.",
			input: DeleteBotInput,
			async execute({ botId }) {
				await context.deleteChild(botId);
				return { deleted: botId };
			},
		}),
		tool({
			name: "list_models",
			description: "Lista os modelos disponíveis e os esforços aceitos por cada um.",
			input: z.object({}),
			async execute() {
				const catalog = await listModels();
				return {
					models: catalog.models.map((option) => ({
						provider: option.provider,
						id: option.id,
						reasoning: option.reasoningOptions,
					})),
					errors: catalog.errors,
				};
			},
		}),
	];
}
