import { defineState } from "eve/context";
import type { ModelInfo } from "../model-info";
import { botIdFromToken, getBot } from "./bots";

interface ResponseModel {
	active: { turnId: string; model: ModelInfo } | null;
	pending: Record<string, ModelInfo>;
	continuation: { model: ModelInfo; requestIds: string[] } | null;
}

export const responseModel = defineState<ResponseModel>("mimo.response-model", () => ({ active: null, pending: {}, continuation: null }));

export async function captureResponseModel(turnId: string, continuationToken?: string) {
	const state = responseModel.get();
	if (state.active?.turnId === turnId) {
		return state.active.model;
	}
	if (state.continuation) {
		const { model, requestIds } = state.continuation;
		responseModel.update((current) => ({
			active: { turnId, model },
			pending: Object.fromEntries(Object.entries(current.pending).filter(([id]) => !requestIds.includes(id))),
			continuation: null,
		}));
		return model;
	}
	const id = botIdFromToken(continuationToken);
	const bot = await getBot(id);
	if (!bot) {
		throw new Error("The bot for this conversation no longer exists.");
	}
	responseModel.update((current) => ({ ...current, active: { turnId, model: bot.model } }));
	return bot.model;
}
