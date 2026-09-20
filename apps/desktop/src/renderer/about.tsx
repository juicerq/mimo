import type { BotInfo, ToolGroup } from "@agent/bot/types";
import type { ModelInfo, ModelOption, ModelSelection, Provider, Reasoning } from "@agent/model/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderIcon, XIcon } from "lucide-react";
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
import { Switch } from "@renderer/components/ui/switch";
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

const TOOL_NAMES: Record<ToolGroup, string> = {
	computer: "Computador",
	web: "Web",
	gmail: "Gmail",
	routines: "Rotinas",
	team: "Equipe",
};

const TOOL_ORDER: ToolGroup[] = ["computer", "web", "gmail", "routines", "team"];

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

function Folder({ folder, onPick, onClear }: { folder: string | null; onPick: () => void; onClear: () => void }) {
	return (
		<div className="flex items-center gap-1">
			<Button variant="outline" size="sm" className="min-w-0 flex-1 justify-start" onClick={onPick} title={folder ?? undefined}>
				<FolderIcon className="shrink-0" />
				<span className="truncate">{folder === null ? "Escolher pasta" : folder.split("/").at(-1)}</span>
			</Button>
			{folder !== null && (
				<Button variant="ghost" size="sm" aria-label="Tirar a pasta" onClick={onClear}>
					<XIcon />
				</Button>
			)}
		</div>
	);
}

function Tools({ tools, onChange }: { tools: ToolGroup[]; onChange: (tools: ToolGroup[]) => void }) {
	function toggle(tool: ToolGroup, on: boolean): void {
		onChange(TOOL_ORDER.filter((entry) => (entry === tool ? on : tools.includes(entry))));
	}

	return (
		<div className="flex flex-col">
			{TOOL_ORDER.map((tool) => (
				<div key={tool} className="flex h-8 items-center justify-between gap-2">
					<label htmlFor={`tool-${tool}`} className="text-sm">
						{TOOL_NAMES[tool]}
					</label>
					<Switch id={`tool-${tool}`} checked={tools.includes(tool)} onCheckedChange={(on) => toggle(tool, on)} />
				</div>
			))}
		</div>
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
	const setTools = useMutation(orpc.bot.setTools.mutationOptions({ onSuccess: apply }));
	const setFolder = useMutation(orpc.bot.setFolder.mutationOptions({ onSuccess: apply }));
	const bot = info.data;

	if (!bot) {
		return null;
	}

	const failure = selectModel.error ?? setTools.error ?? setFolder.error ?? catalog.error;

	async function pickFolder(): Promise<void> {
		const picked = await rpc.bot.pickFolder();
		if (picked) {
			setFolder.mutate({ botId, folder: picked });
		}
	}

	return (
		<>
			<Brain
				model={bot.model}
				catalog={catalog.data}
				loading={catalog.isPending}
				onChange={(model) => selectModel.mutate({ botId, model })}
			/>
			<Field label="Ferramentas">
				<Tools tools={bot.tools} onChange={(tools) => setTools.mutate({ botId, tools })} />
			</Field>
			<Field label="Pasta">
				<Folder folder={bot.folder ?? null} onPick={pickFolder} onClear={() => setFolder.mutate({ botId, folder: null })} />
			</Field>
			<Field label="Criado">
				<p className="text-sm">{new Date(bot.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
			</Field>
			{failure && <p className="mt-5 text-xs text-destructive wrap-anywhere">{failure.message}</p>}
		</>
	);
}
