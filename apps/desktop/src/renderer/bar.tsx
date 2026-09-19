import { Blobatar } from "blobatar/react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Avatar, STATE_LABELS } from "./avatar";
import type { BotRow } from "./bots";
import { orpc } from "./rpc";

const STEPS: Partial<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1 };

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
			const rows = list.current?.querySelectorAll<HTMLButtonElement>(".row");
			const current = rows && [...rows].find((row) => row.getAttribute("aria-current") === "true");
			(current ?? rows?.[0])?.focus();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onLeave]);

	function onListKey(event: KeyboardEvent<HTMLDivElement>): void {
		const all = bots ?? [];
		const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".row")];
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
		<aside className="side" aria-label="Bots">
			<header className="side-top">
				<button type="button" className="icon" aria-label="Novo bot" title="Novo bot" onClick={() => setAdding(true)}>
					<PlusIcon />
				</button>
			</header>
			<div className="list" ref={list} onKeyDown={onListKey}>
				{(adding || empty) && (
					<form
						className="add"
						onSubmit={(event) => {
							event.preventDefault();
							if (draft && !create.isPending) {
								create.mutate({ name });
							}
						}}
					>
						{draft ? (
							<span className="av" aria-hidden>
								<Blobatar name={draft} size={47} />
							</span>
						) : (
							<span className="av ph" aria-hidden />
						)}
						<span className="txt">
							<input
								autoFocus
								maxLength={80}
								value={name}
								placeholder="Nome do bot"
								aria-label="Nome do novo bot"
								autoComplete="off"
								spellCheck={false}
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
							{create.error && <span className="add-error">{create.error.message}</span>}
						</span>
					</form>
				)}
				{bots?.map((bot) => (
					<button
						key={bot.id}
						type="button"
						className="row"
						aria-current={bot.id === selected}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => onSelect(bot.id)}
					>
						<Avatar name={bot.name} state={bot.state} size={47} />
						<span className="txt">
							<span className="name">{bot.name}</span>
							<span className="last">{preview(bot)}</span>
						</span>
						<span className="sr">{STATE_LABELS[bot.state]}</span>
					</button>
				))}
				{error && <p className="list-error">{error.message}</p>}
			</div>
		</aside>
	);
}
