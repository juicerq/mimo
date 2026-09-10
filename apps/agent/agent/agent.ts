import { defineAgent, defineDynamic } from "eve";
import { resolveModel } from "./model";

export default defineAgent({
	model: defineDynamic({
		events: {
			"step.started": (_event, ctx) => {
				const { model, contextWindowTokens } = resolveModel(ctx.session.id);
				return { model, modelContextWindowTokens: contextWindowTokens };
			},
		},
	}),
});
