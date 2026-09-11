import { defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import { captureResponseModel } from "./lib/response-model";
import { resolveModel } from "./model";

const StepSchema = z.object({ data: z.object({ turnId: z.string() }) });

export default defineAgent({
	limits: { sessionTimeoutMs: false, maxInputTokensPerSession: false },
	model: defineDynamic({
		events: {
			"step.started": async (event, ctx) => {
				const { data } = StepSchema.parse(event);
				const model = await captureResponseModel(data.turnId, ctx.channel.continuationToken);
				return resolveModel(model, ctx.session.id);
			},
		},
	}),
});
