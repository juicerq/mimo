import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { IconButton } from "@renderer/components/icon-button";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@renderer/components/ui/item";
import { Avatar, STATE_LABELS } from "./avatar";
import type { BotRow } from "./bots";
import { orpc } from "./rpc";

const STEPS: Partial<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1 };
const ROW = "[aria-current]";
const AVATAR = 48;

function plain(text: string): string {
	return text
		.replaceAll(/^\s*(?:#{1,6}|>|[-*+]|\d+\.)\s+/gmu, "")
		.replaceAll(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
		.replaceAll(/\*\*|__|~~|`/gu, "");
}

function preview(bot: BotRow): string {
	if (!bot.last) {
		return "Sem mensagens ainda";
	}
	if (bot.last.from === "you") {
		return `Você: ${bot.last.text}`;
	}
	return plain(bot.last.text);
}

interface BarProps {
	bots: BotRow[] | undefined;
	error: Error | null;
	selected: string | undefined;
	onSelect: (id: string) => void;
	onLeave: () => void;
}

export function Bar({ bots, error, selected, onSelect, onLeave }: BarProps) {
	const queryClient = useQueryClient();
	const [adding, setAdding] = useState(false);
	const [name, setName] = useState("");
	const list = useRef<HTMLDivElement>(null);
	const create = useMutation(orpc.bots.create.mutationOptions({
		onSuccess: async (bot) => {
			await queryClient.invalidateQueries({ queryKey: orpc.bots.list.key() });
			setName("");
			setAdding(false);
			onSelect(bot.id);
		},
	}));
	const empty = bots?.length === 0;
	const draft = name.trim();

	useEffect(() => {
		function onKey(event: globalThis.KeyboardEvent): void {
			if (!event.ctrlKey || event.key.toLowerCase() !== "e") {
				return;
			}
			event.preventDefault();
			if (list.current?.contains(document.activeElement)) {
				onLeave();
				return;
			}
			const rows = list.current?.querySelectorAll<HTMLButtonElement>(ROW);
			const current = rows && [...rows].find((row) => row.getAttribute("aria-current") === "true");
			(current ?? rows?.[0])?.focus();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onLeave]);

	function onListKey(event: KeyboardEvent<HTMLDivElement>): void {
		const all = bots ?? [];
		const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(ROW)];
		const at = rows.findIndex((row) => row === event.target);
		if (event.key === "Escape") {
			event.preventDefault();
			onLeave();
			return;
		}
		if (event.key === "Enter" && all[at]) {
			event.preventDefault();
			onSelect(all[at].id);
			onLeave();
			return;
		}
		const step = STEPS[event.key];
		if (step === undefined || !all[at]) {
			return;
		}
		event.preventDefault();
		const next = Math.min(all.length - 1, Math.max(0, at + step));
		onSelect(all[next].id);
		rows[next]?.focus();
	}

	function stopAdding(): void {
		setName("");
		setAdding(false);
		create.reset();
	}

	return (
		<aside className="flex w-66 shrink-0 flex-col border-r surface-sidebar" aria-label="Bots">
			<header className="drag flex h-bar shrink-0 items-center justify-end px-3">
				<IconButton label="Novo bot" onClick={() => setAdding(true)}>
					<PlusIcon />
				</IconButton>
			</header>
			<div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3" ref={list} onKeyDown={onListKey}>
				{(adding || empty) && (
					<Item
						className="gap-3 p-2 surface-sidebar-active"
						render={
							<form
								onSubmit={(event) => {
									event.preventDefault();
									if (draft && !create.isPending) {
										create.mutate({ name });
									}
								}}
							/>
						}
					>
						{draft ? (
							<Avatar name={draft} state="idle" size={AVATAR} />
						) : (
							<span className="size-12 shrink-0 rounded-full border-2 border-dashed border-muted-foreground/50" aria-hidden />
						)}
						<ItemContent className="min-w-0 gap-0">
							<input
								autoFocus
								maxLength={80}
								value={name}
								placeholder="Nome do bot"
								aria-label="Nome do novo bot"
								autoComplete="off"
								spellCheck={false}
								className="w-full font-medium outline-hidden placeholder:font-normal placeholder:text-muted-foreground"
								onChange={(event) => {
									setName(event.target.value);
									create.reset();
								}}
								onKeyDown={(event) => {
									if (event.key === "Escape" && !empty) {
										event.stopPropagation();
										stopAdding();
										onLeave();
									}
								}}
								onBlur={() => {
									if (!draft && !empty) {
										stopAdding();
									}
								}}
							/>
							{create.error && <span className="text-xs text-destructive wrap-anywhere">{create.error.message}</span>}
						</ItemContent>
					</Item>
				)}
				{bots?.map((bot) => (
					<Item
						key={bot.id}
						className="gap-3 p-2 text-left hover:surface-sidebar-hover aria-[current=true]:surface-sidebar-active"
						render={<button type="button" />}
						aria-current={bot.id === selected}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => onSelect(bot.id)}
					>
						<Avatar name={bot.name} state={bot.state} size={AVATAR} />
						<ItemContent className="min-w-0 gap-0">
							<ItemTitle className="block w-full truncate">{bot.name}</ItemTitle>
							<ItemDescription className="block truncate text-xs">{preview(bot)}</ItemDescription>
						</ItemContent>
						<span className="sr-only">{STATE_LABELS[bot.state]}</span>
					</Item>
				))}
				{error && <p className="p-2 text-xs text-destructive wrap-anywhere">{error.message}</p>}
			</div>
		</aside>
	);
}
