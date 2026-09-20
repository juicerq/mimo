import type { ToolGroup } from "@agent/bot/types";
import type { ModelOption, Provider, Reasoning } from "@agent/model/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderIcon, XIcon } from "lucide-react";
import { Field } from "@renderer/components/setting";
import { Button } from "@renderer/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@renderer/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@renderer/components/ui/toggle-group";
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

function modelKey(model: Pick<ModelOption, "provider" | "id">): string {
	return `${model.provider}|${model.id}`;
}

interface ChooseProps<T extends string> {
	label: string;
	value: T;
	options: readonly T[];
	names: Record<string, string>;
	onChange: (value: T) => void;
}

function Choose<T extends string>({ label, value, options, names, onChange }: ChooseProps<T>) {
	return (
		<Select
			items={options.map((option) => ({ label: names[option] ?? option, value: option }))}
			value={value}
			onValueChange={(next) => {
				const picked = options.find((option) => option === next);
				if (picked) {
					onChange(picked);
				}
			}}
		>
			<SelectTrigger size="sm" className="w-full" aria-label={label}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option} value={option}>
						{names[option] ?? option}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function Folder({ folder, onPick, onClear }: { folder: string | null; onPick: () => void; onClear: () => void }) {
	return (
		<div className="flex items-center gap-1">
			<Button variant="outline" size="sm" className="min-w-0 flex-1 justify-start" onClick={onPick}>
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
	return (
		<ToggleGroup
			aria-label="Ferramentas"
			multiple
			value={tools}
			onValueChange={(next) => onChange(TOOL_ORDER.filter((tool) => next.includes(tool)))}
			className="w-full flex-wrap"
		>
			{TOOL_ORDER.map((tool) => (
				<ToggleGroupItem
					key={tool}
					value={tool}
					size="sm"
					variant="outline"
					className="text-muted-foreground aria-pressed:border-transparent aria-pressed:text-foreground"
				>
					{TOOL_NAMES[tool]}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

export function About({ botId }: { botId: string }) {
	const queryClient = useQueryClient();
	const info = useQuery(orpc.bot.info.queryOptions({ input: { botId } }));
	const catalog = useQuery(orpc.bot.models.queryOptions());
	const refresh = async () => {
		await queryClient.invalidateQueries({ queryKey: orpc.bot.info.key({ input: { botId } }) });
	};
	const selectModel = useMutation(orpc.bot.selectModel.mutationOptions({ onSuccess: refresh }));
	const setTools = useMutation(orpc.bot.setTools.mutationOptions({ onSuccess: refresh }));
	const setFolder = useMutation(orpc.bot.setFolder.mutationOptions({ onSuccess: refresh }));
	const bot = info.data;

	if (!bot) {
		return null;
	}

	const failure = selectModel.error ?? setTools.error ?? setFolder.error ?? catalog.error;
	const models = catalog.data?.models ?? [];
	const chosen = models.find((model) => modelKey(model) === modelKey(bot.model));
	const efforts = chosen?.reasoningOptions ?? [bot.model.reasoning];
	const modelNames = Object.fromEntries(models.map((model) => [modelKey(model), model.name]));

	async function pickFolder(): Promise<void> {
		const picked = await rpc.bot.pickFolder();
		if (picked) {
			setFolder.mutate({ botId, folder: picked });
		}
	}

	function choose(provider: Provider, id: string, reasoning: Reasoning): void {
		selectModel.mutate({ botId, model: { provider, id, reasoning } });
	}

	return (
		<>
			<Field label="Modelo">
				<Choose
					label="Modelo"
					value={modelKey(bot.model)}
					options={models.map(modelKey)}
					names={modelNames}
					onChange={(key) => {
						const picked = models.find((model) => modelKey(model) === key);
						if (picked) {
							choose(picked.provider, picked.id, picked.defaultReasoning);
						}
					}}
				/>
			</Field>
			<Field label="Esforço">
				<Choose
					label="Esforço"
					value={bot.model.reasoning}
					options={efforts}
					names={REASONING_NAMES}
					onChange={(reasoning) => choose(bot.model.provider, bot.model.id, reasoning)}
				/>
			</Field>
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
