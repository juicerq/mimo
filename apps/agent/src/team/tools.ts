import type { AgentTool } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import { createBot, listChildren, type BotPatch } from "../bot/store";
import { BotNameSchema, BotPromptSchema, ChildGroupSchema, type BotInfo, type TeamCall, type TeamCallKind, type TeamMember } from "../bot/types";
import { listModels, selectModel } from "../model/catalog";
import { ModelSelectionSchema } from "../model/types";
import type { ToolContext } from "../tools/context";
import { parseJson, tool } from "../tools/tool";

const NameInput = z.string().describe("Nome curto do filho.").pipe(BotNameSchema);
const PromptInput = BotPromptSchema.describe("Instrução permanente do filho, escrita sem depender desta conversa.");
const ToolsInput = z.array(ChildGroupSchema).min(1).describe("Grupos de tools liberados para o filho.");
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
	task: z.string().trim().min(1).max(48).describe("O trabalho em poucas palavras, para a pessoa ler na tela. Diga o que este filho carrega, não o que a equipe faz."),
	prompt: z.string().min(1).describe("O trabalho para o filho, com tudo o que ele precisa saber."),
	worktree: z.string().trim().min(1).optional().describe("O git worktree onde este filho trabalha. É só o rótulo que a pessoa lê na tela: quem manda o filho ir para lá é o prompt."),
});

const TEAM_CALLS: Record<string, TeamCallKind | undefined> = {
	create_bot: "created",
	delegate: "delegated",
	stop_bot: "stopped",
	delete_bot: "deleted",
};

const TeamResult = z.object({ bot: BotNameSchema.optional(), name: BotNameSchema.optional(), task: z.string().optional() });

export function teamCall(toolName: string, output: string): TeamCall | null {
	const kind = TEAM_CALLS[toolName];
	if (kind === undefined) {
		return null;
	}
	const parsed = TeamResult.safeParse(parseJson(output));
	if (!parsed.success) {
		return null;
	}
	const bot = parsed.data.bot ?? parsed.data.name;
	if (bot === undefined) {
		return null;
	}
	return { kind, bot, ...parsed.data.task && { task: parsed.data.task } };
}

export function isTeamCall(toolName: string): boolean {
	return TEAM_CALLS[toolName] !== undefined;
}

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

function teamView(name: string, member: TeamMember | undefined) {
	if (!member) {
		return { name, working: false };
	}
	return { name, working: true, task: member.task, worktree: member.worktree, tool: member.tool, seconds: Math.floor((Date.now() - member.startedAt) / 1_000) };
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
			description: "Começa um trabalho num filho e volta na hora. A resposta dele chega depois, sozinha. O filho não vê esta conversa: escreva o pedido inteiro no prompt.",
			input: DelegateInput,
			async execute(input) {
				const target = await child(context, input.bot);
				await context.delegate({ botId: target.id, task: input.task, prompt: input.prompt, ...input.worktree && { worktree: input.worktree } });
				return { bot: target.name, task: input.task, status: "started" };
			},
		}),
		tool({
			name: "check_team",
			description: "Mostra o que cada filho está fazendo agora: a tool do momento e há quanto tempo trabalha.",
			input: z.object({}),
			async execute() {
				const working = new Map(context.team.map((member) => [member.name, member]));
				return (await listChildren(context.botId)).map((bot) => teamView(bot.name, working.get(bot.name)));
			},
		}),
		tool({
			name: "stop_bot",
			description: "Para o trabalho de um filho agora. O trabalho já feito não é desfeito.",
			input: DeleteBotInput,
			async execute(input) {
				const target = await child(context, input.bot);
				return { bot: context.stopChild(target.id), status: "stopped" };
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
				return { bot: target.name, status: "deleted" };
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
