import type { BotInfo } from "@agent/bot/types";
import { listModels } from "@agent/model/catalog";
import { PROVIDER_NAMES, ProviderSchema, type ModelCatalog, type ModelOption, type ModelSelection, type Provider } from "@agent/model/types";
import { choicePanel, type Panel, type PanelView } from "../panel";

type Reasoning = ModelOption["reasoningOptions"][number];

export type SaveModel = (selection: ModelSelection) => Promise<BotInfo>;

export function modelPanel(bot: BotInfo, save: SaveModel): Panel {
	let catalog: ModelCatalog = { models: [], errors: [] };

	return choicePanel<Provider>({
		heading: `${bot.name}  ·  model`,
		load: async () => {
			catalog = await listModels();
			return {
				choices: ProviderSchema.options.map((provider) => ({
					id: provider,
					label: `${PROVIDER_NAMES[provider]} · ${catalog.models.filter((option) => option.provider === provider).length} models`,
				})),
				notes: catalog.errors.map((failure) => `${PROVIDER_NAMES[failure.provider]}: ${failure.message}`),
			};
		},
		pick: (provider, view) => view.show(providerPanel(provider, catalog, save)),
	});
}

export function effortPanel(option: ModelOption, save: SaveModel): Panel {
	const heading = `${option.name}  ·  effort`;
	const [only, ...rest] = option.reasoningOptions;
	if (only !== undefined && rest.length === 0) {
		return {
			heading,
			start: (view) => {
				store(option, only, save, view);
			},
		};
	}

	return choicePanel<Reasoning>({
		heading,
		load: () => ({ choices: option.reasoningOptions.map((effort) => ({ id: effort, label: effort })) }),
		pick: (reasoning, view) => {
			store(option, reasoning, save, view);
		},
	});
}

function providerPanel(provider: Provider, catalog: ModelCatalog, save: SaveModel): Panel {
	const options = catalog.models.filter((option) => option.provider === provider);
	const failure = catalog.errors.find((error) => error.provider === provider);

	return choicePanel({
		heading: `${PROVIDER_NAMES[provider]}  ·  model`,
		empty: failure?.message ?? "No model is available for this provider.",
		load: () => ({ choices: options.map((option) => ({ id: option.id, label: option.name })) }),
		pick: (id, view) => {
			const chosen = options.find((option) => option.id === id);
			if (chosen) {
				view.show(effortPanel(chosen, save));
			}
		},
	});
}

function store(option: ModelOption, reasoning: Reasoning, save: SaveModel, view: PanelView): void {
	view.saving(async () => {
		const bot = await save({ provider: option.provider, id: option.id, reasoning });
		view.close({ message: "Model saved for the next response.", bot });
	});
}
