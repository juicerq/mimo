import type { BotInfo } from "@agent/bot/types";
import type { ModelInfo, ModelOption, ModelSelection, Provider, Reasoning } from "@agent/model/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field } from "@renderer/components/setting";
import { Button } from "@renderer/components/ui/button";
import {
	Combobox,
	ComboboxCollection,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxGroup,
	ComboboxInput,
	ComboboxItem,
	ComboboxLabel,
	ComboboxList,
	ComboboxTrigger,
} from "@renderer/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@renderer/components/ui/select";
import { Textarea } from "@renderer/components/ui/textarea";
import { Preview } from "./preview";
import { orpc, rpc } from "./rpc";

const REASONING_NAMES: Record<Reasoning, string> = {
	off: "Nenhum",
	minimal: "Mínimo",
	low: "Baixo",
	medium: "Médio",
	high: "Alto",
	xhigh: "Muito alto",
	max: "Máximo",
};

type Catalog = Awaited<ReturnType<typeof rpc.bot.models>>;

interface ModelItem {
	value: string;
	label: string;
}

interface ModelGroup {
	value: string;
	items: ModelItem[];
}

function modelKey(model: Pick<ModelOption, "provider" | "id">): string {
	return `${model.provider}|${model.id}`;
}

function groupModels(models: ModelOption[], providers: Record<Provider, string>): ModelGroup[] {
	const groups: ModelGroup[] = [];
	for (const model of models) {
		const name = providers[model.provider];
		const group = groups.find((entry) => entry.value === name);
		const item = { value: modelKey(model), label: model.name };
		if (group) {
			group.items.push(item);
			continue;
		}
		groups.push({ value: name, items: [item] });
	}
	return groups;
}

interface ModelProps {
	name: string;
	provider: string;
	current: ModelItem | null;
	groups: ModelGroup[];
	loading: boolean;
	onChange: (key: string) => void;
}

function Model({ name, provider, current, groups, loading, onChange }: ModelProps) {
	return (
		<Combobox
			items={groups}
			value={current}
			isItemEqualToValue={(item: ModelItem, other: ModelItem) => item.value === other.value}
			onValueChange={(item: ModelItem | null) => {
				if (item) {
					onChange(item.value);
				}
			}}
		>
			<ComboboxTrigger
				aria-label="Modelo"
				render={<Button variant="outline" className="h-auto w-full justify-between py-1.5 font-normal" />}
			>
				<span className="flex min-w-0 flex-col items-start">
					<span className="max-w-full truncate">{name}</span>
					<span className="max-w-full truncate text-xs text-muted-foreground">{provider}</span>
				</span>
			</ComboboxTrigger>
			<ComboboxContent align="end" className="w-72">
				<ComboboxInput placeholder="Procurar modelo" showTrigger={false} />
				<ComboboxEmpty>{loading ? "Carregando modelos…" : "Nenhum modelo com esse nome."}</ComboboxEmpty>
				<ComboboxList>
					{(group: ModelGroup) => (
						<ComboboxGroup key={group.value} items={group.items}>
							<ComboboxLabel>{group.value}</ComboboxLabel>
							<ComboboxCollection>
								{(item: ModelItem) => (
									<ComboboxItem key={item.value} value={item}>
										{item.label}
									</ComboboxItem>
								)}
							</ComboboxCollection>
						</ComboboxGroup>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}

interface EffortProps {
	value: Reasoning;
	options: readonly Reasoning[];
	onChange: (value: Reasoning) => void;
}

function Effort({ value, options, onChange }: EffortProps) {
	return (
		<Select
			items={options.map((option) => ({ label: REASONING_NAMES[option], value: option }))}
			value={value}
			disabled={options.length < 2}
			onValueChange={(next) => {
				const picked = options.find((option) => option === next);
				if (picked) {
					onChange(picked);
				}
			}}
		>
			<SelectTrigger size="sm" className="w-full" aria-label="Esforço">
				<SelectValue />
			</SelectTrigger>
			<SelectContent alignItemWithTrigger={false} align="end">
				{options.map((option) => (
					<SelectItem key={option} value={option}>
						{REASONING_NAMES[option]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

interface BrainProps {
	model: ModelInfo;
	catalog: Catalog | undefined;
	loading: boolean;
	onChange: (model: ModelSelection) => void;
}

function Brain({ model, catalog, loading, onChange }: BrainProps) {
	const models = catalog?.models ?? [];
	const chosen = models.find((option) => modelKey(option) === modelKey(model));
	const groups = catalog ? groupModels(models, catalog.providerNames) : [];
	const current = groups.flatMap((group) => group.items).find((item) => item.value === modelKey(model)) ?? null;

	function pick(key: string): void {
		const picked = models.find((option) => modelKey(option) === key);
		if (picked) {
			onChange({ provider: picked.provider, id: picked.id, reasoning: picked.defaultReasoning });
		}
	}

	return (
		<>
			<Field label="Modelo">
				<Model
					name={chosen?.name ?? model.id}
					provider={catalog?.providerNames[model.provider] ?? model.provider}
					current={current}
					groups={groups}
					loading={loading}
					onChange={pick}
				/>
			</Field>
			<Field label="Esforço">
				<Effort
					value={model.reasoning}
					options={chosen?.reasoningOptions ?? [model.reasoning]}
					onChange={(reasoning) => onChange({ provider: model.provider, id: model.id, reasoning })}
				/>
			</Field>
		</>
	);
}

interface InstructionProps {
	botId: string;
	prompt: string;
	onSave: (record: BotInfo) => void;
}

function Instruction({ botId, prompt, onSave }: InstructionProps) {
	const instruct = useMutation(orpc.bot.instruct.mutationOptions({ onSuccess: onSave }));

	return (
		<Field label="Instrução">
			<Textarea
				aria-label="Instrução"
				defaultValue={prompt}
				maxLength={4_000}
				spellCheck={false}
				placeholder="O que ele faz e como ele responde. Os outros bots leem a primeira linha."
				className="max-h-64 min-h-24 text-sm"
				onBlur={(event) => {
					const next = event.target.value.trim();
					if (next !== prompt) {
						instruct.mutate({ botId, prompt: next });
					}
				}}
			/>
			{instruct.error && <p className="mt-1.5 text-xs text-destructive wrap-anywhere">{instruct.error.message}</p>}
		</Field>
	);
}

export function About({ botId }: { botId: string }) {
	const queryClient = useQueryClient();
	const info = useQuery(orpc.bot.info.queryOptions({ input: { botId } }));
	const catalog = useQuery(orpc.bot.models.queryOptions());
	const apply = (record: BotInfo) => {
		queryClient.setQueryData(orpc.bot.info.key({ input: { botId }, type: "query" }), record);
	};
	const selectModel = useMutation(orpc.bot.selectModel.mutationOptions({ onSuccess: apply }));
	const bot = info.data;

	if (!bot) {
		return null;
	}

	const failure = selectModel.error ?? catalog.error;

	return (
		<>
			<Preview botId={botId} />
			<Instruction key={botId} botId={botId} prompt={bot.prompt ?? ""} onSave={apply} />
			<Brain
				model={bot.model}
				catalog={catalog.data}
				loading={catalog.isPending}
				onChange={(model) => selectModel.mutate({ botId, model })}
			/>
			<Field label="Criado">
				<p className="text-sm">{new Date(bot.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
			</Field>
			{failure && <p className="mt-5 text-xs text-destructive wrap-anywhere">{failure.message}</p>}
		</>
	);
}
