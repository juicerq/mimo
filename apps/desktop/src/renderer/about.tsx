import type { BotInfo } from "@agent/bot/types";
import type { ModelInfo, ModelOption, ModelSelection, Provider, Reasoning } from "@agent/model/types";
import { useState } from "react";
import { Slider } from "@base-ui/react/slider";
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

const THUMB = 21;

const STARS = [
	{ x: 0.3, y: 0.62, size: 1, delay: 0.9 },
	{ x: 0.38, y: 0.24, size: 1.5, delay: 0 },
	{ x: 0.45, y: 0.78, size: 1, delay: 1.7 },
	{ x: 0.52, y: 0.32, size: 2, delay: 0.4 },
	{ x: 0.57, y: 0.7, size: 1, delay: 2.1 },
	{ x: 0.63, y: 0.18, size: 1.5, delay: 1.2 },
	{ x: 0.68, y: 0.55, size: 1, delay: 0.2 },
	{ x: 0.72, y: 0.82, size: 2, delay: 1.5 },
	{ x: 0.77, y: 0.28, size: 1, delay: 0.7 },
	{ x: 0.81, y: 0.66, size: 1.5, delay: 2.3 },
	{ x: 0.85, y: 0.2, size: 1, delay: 0.5 },
	{ x: 0.89, y: 0.75, size: 2, delay: 1.9 },
	{ x: 0.93, y: 0.42, size: 1, delay: 1.1 },
	{ x: 0.97, y: 0.6, size: 1.5, delay: 0.3 },
];

function Effort({ value, options, onChange }: EffortProps) {
	const [held, setHeld] = useState<number | null>(null);
	const index = Math.max(options.indexOf(value), 0);

	if (held === index) {
		setHeld(null);
	}

	const shown = held ?? index;
	const name = REASONING_NAMES[options.at(shown) ?? value];
	const steps = Math.max(options.length - 1, 1);
	const half = Math.ceil(steps / 2);
	const spark = options.length < 2 ? 0 : Math.max(shown - half + 1, 0) / (steps - half + 1);

	function tick(step: number): string {
		const ratio = step / steps;
		return `calc(${ratio * 100}% + ${THUMB / 2 - ratio * THUMB}px)`;
	}

	return (
		<Slider.Root
			className="mt-5"
			value={shown}
			min={0}
			max={steps}
			disabled={options.length < 2}
			thumbAlignment="edge"
			onValueChange={setHeld}
			onValueCommitted={(next) => {
				const picked = options.at(next);
				if (picked && picked !== value) {
					onChange(picked);
				}
			}}
		>
			<div className="flex items-baseline justify-between">
				<Slider.Label className="text-xs font-medium text-muted-foreground">Esforço</Slider.Label>
				<span className="text-xs font-medium">{name}</span>
			</div>
			<Slider.Control
				className="mt-2 flex w-full touch-none items-center select-none data-disabled:opacity-50"
				style={{ height: THUMB }}
			>
				<Slider.Track className="relative w-full rounded-full bg-muted" style={{ height: THUMB }}>
					<Slider.Indicator className="rounded-full bg-muted-foreground/30" />
					{options.map((option, step) => (
						<span
							key={option}
							className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/30"
							style={{ left: tick(step) }}
						/>
					))}
					<span
						className="pointer-events-none absolute inset-0 overflow-hidden rounded-full transition-opacity duration-500"
						style={{ opacity: spark }}
					>
						{STARS.map((star) => (
							<span
								key={star.x}
								className="absolute animate-twinkle rounded-full bg-foreground"
								style={{
									left: `${star.x * 100}%`,
									top: `${star.y * 100}%`,
									width: star.size,
									height: star.size,
									animationDelay: `${star.delay}s`,
								}}
							/>
						))}
					</span>
					<Slider.Thumb
						className="rounded-full bg-foreground shadow-sm outline-offset-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
						getAriaValueText={() => name}
						style={{ height: THUMB, width: THUMB }}
					/>
				</Slider.Track>
			</Slider.Control>
		</Slider.Root>
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
			<Effort
				value={model.reasoning}
				options={chosen?.reasoningOptions ?? [model.reasoning]}
				onChange={(reasoning) => onChange({ provider: model.provider, id: model.id, reasoning })}
			/>
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
