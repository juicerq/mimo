import { defineHook } from "eve/hooks";
import { botIdFromToken, sessionBotId } from "../lib/bots";
import { captureResponseModel, responseModel } from "../lib/response-model";

export default defineHook({
	events: {
		"turn.started": async (event, ctx) => {
			sessionBotId.update(() => botIdFromToken(ctx.channel.continuationToken));
			await captureResponseModel(event.data.turnId, ctx.channel.continuationToken);
		},
		"input.requested": (event) => {
			const model = responseModel.get().active?.model;
			if (!model) {
				throw new Error("An approval needs an active response model.");
			}
			responseModel.update((current) => ({
				...current,
				pending: { ...Object.fromEntries(event.data.requests.map((request) => [request.requestId, model])), ...current.pending },
			}));
		},
		"input.resolved": (event) => {
			const state = responseModel.get();
			const requestIds = event.data.resolutions.map((resolution) => resolution.requestId);
			const model = requestIds.map((id) => state.pending[id]).find((selection) => selection !== undefined);
			if (model) {
				responseModel.update((current) => ({ ...current, continuation: { model, requestIds: [...(current.continuation?.requestIds ?? []), ...requestIds] } }));
			}
		},
	},
});
