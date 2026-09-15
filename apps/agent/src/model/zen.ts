import type { Api, Model, Provider } from "@earendil-works/pi-ai";

const FREE_SUFFIX = "-free";

function withSessionAffinity(model: Model<Api>): Model<Api> {
	if (!model.id.endsWith(FREE_SUFFIX)) {
		return model;
	}
	return { ...model, compat: { ...model.compat, sessionAffinityFormat: "openrouter" } };
}

export function withFreeTier(provider: Provider): Provider {
	return { ...provider, getModels: () => provider.getModels().map(withSessionAffinity) };
}
