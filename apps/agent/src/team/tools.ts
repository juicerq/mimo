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
	bot: NameInput,
	name: NameInput.optional(),
	prompt: PromptInput.optional(),
	tools: ToolsInput.optional(),
	model: ModelInput.optional(),
});

const DeleteBotInput = z.object({ bot: NameInput });

const DelegateInput = z.object({
	bot: NameInput,
	prompt: z.string().min(1).describe("O trabalho para o filho, com tudo o que ele precisa saber."),
});

function botView(bot: BotInfo) {
	return {
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

async function child(context: ToolContext, name: string): Promise<BotInfo> {
	const found = (await listChildren(context.botId)).find((bot) => bot.name === name);
	if (!found) {
		throw new Error(`Você não tem um filho chamado ${name}. Veja os nomes com list_bots.`);
	}
	return found;
}

export function teamTools(context: ToolContext): AgentTool[] {
	return [
		tool({
			name: "create_bot",
			description: "Cria um bot filho com instrução, tools e modelo próprios. Ele pertence a você e não aparece na lista da pessoa.",
			input: CreateBotInput,
			async execute({ model, ...draft }) {
				const taken = (await listChildren(context.botId)).some((bot) => bot.name === draft.name);
				if (taken) {
					throw new Error(`Você já tem um filho chamado ${draft.name}.`);
				}
				return botView(await createBot({
					...draft,
					parentId: context.botId,
					...model && { model: selectModel(model) },
				}));
			},
		}),
		tool({
			name: "delegate",
			description: "Entrega um trabalho a um filho e espera a resposta dele. O filho não vê esta conversa: escreva o pedido inteiro no prompt.",
			input: DelegateInput,
			async execute(input, signal) {
				const target = await child(context, input.bot);
				return { bot: target.name, reply: await context.delegate(target.id, input.prompt, signal) };
			},
		}),
		tool({
			name: "update_bot",
			description: "Muda o nome, a instrução, as tools ou o modelo de um filho. Só os campos enviados mudam.",
			input: UpdateBotInput,
			async execute(input) {
				const target = await child(context, input.bot);
				return botView(await context.updateChild(target.id, botPatch(input)));
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
			async execute(input) {
				const target = await child(context, input.bot);
				await context.deleteChild(target.id);
				return { deleted: target.name };
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
