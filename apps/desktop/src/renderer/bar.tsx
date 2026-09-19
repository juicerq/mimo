import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { type Outputs, orpc } from "./rpc";
import type { Detail } from "./transcript";

type Activity = Outputs["bots"]["activity"][number];

type State = "failed" | "waiting" | "working" | "idle";

const MARKS: Record<State, { glyph: string; label: string }> = {
	failed: { glyph: "✗", label: "falhou" },
	waiting: { glyph: "⏸", label: "esperando aprovação" },
	working: { glyph: "●", label: "trabalhando" },
	idle: { glyph: "", label: "parado" },
};

const STEPS: Partial<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1 };

function stateOf(live: Activity | undefined): State {
	if (!live) {
		return "idle";
	}
	if (live.failed !== null) {
		return "failed";
	}
	if (live.waiting !== null) {
		return "waiting";
	}
	if (live.busy || live.team.length > 0) {
		return "working";
	}
	return "idle";
}

interface BarProps {
	selected: string | undefined;
	level: Detail;
	onSelect: (id: string) => void;
	onLeave: () => void;
}

export function Bar({ selected, level, onSelect, onLeave }: BarProps) {
	const queryClient = useQueryClient();
	const bots = useQuery(orpc.bots.list.queryOptions());
	const activity = useQuery(orpc.bots.activity.queryOptions({ refetchInterval: 1000 }));
	const [adding, setAdding] = useState(false);
	const [name, setName] = useState("");
	const [browsing, setBrowsing] = useState(false);
	const list = useRef<HTMLDivElement>(null);
	const create = useMutation(orpc.bots.create.mutationOptions({
		onSuccess: async (bot) => {
			await queryClient.invalidateQueries({ queryKey: orpc.bots.list.key() });
			setName("");
			setAdding(false);
			onSelect(bot.id);
		},
	}));
	const live = new Map(activity.data?.map((entry) => [entry.id, entry]));
	const empty = bots.data?.length === 0;

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
			const buttons = list.current?.querySelectorAll("button");
			const current = buttons && [...buttons].find((button) => button.getAttribute("aria-current") === "true");
			(current ?? buttons?.[0])?.focus();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onLeave]);

	function onListKey(event: KeyboardEvent<HTMLDivElement>): void {
		const all = bots.data ?? [];
		const buttons = [...event.currentTarget.querySelectorAll("button")];
		const at = buttons.findIndex((button) => button === event.target);
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
		buttons[next]?.focus();
	}

	function stopAdding(): void {
		setName("");
		setAdding(false);
		create.reset();
		onLeave();
	}

	return (
		<nav className="bots">
			<header>
				<span>bots</span>
				<button type="button" aria-label="novo bot" title="novo bot" onClick={() => setAdding(true)}>
					+
				</button>
			</header>
			{(adding || empty) && (
				<form
					onSubmit={(event) => {
						event.preventDefault();
						if (name.trim() && !create.isPending) {
							create.mutate({ name });
						}
					}}
				>
					<input
						autoFocus
						maxLength={80}
						value={name}
						placeholder="nome do bot"
						onChange={(event) => setName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape" && !empty) {
								stopAdding();
							}
						}}
						onBlur={() => {
							if (!name.trim() && !empty) {
								setAdding(false);
								create.reset();
							}
						}}
					/>
				</form>
			)}
			{create.error && <p className="alert">{create.error.message}</p>}
			<div className="list" ref={list} onKeyDown={onListKey} onFocus={() => setBrowsing(true)} onBlur={() => setBrowsing(false)}>
				{bots.data?.map((bot) => {
					const mark = MARKS[stateOf(live.get(bot.id))];
					return (
						<button
							key={bot.id}
							type="button"
							aria-current={bot.id === selected}
							aria-label={`${bot.name}, ${mark.label}`}
							title={mark.label}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => onSelect(bot.id)}
						>
							<span className="mark" aria-hidden>
								{mark.glyph}
							</span>
							{bot.name}
						</button>
					);
				})}
			</div>
			{bots.error && <p className="alert">{bots.error.message}</p>}
			<footer>
				<p>{browsing ? "↑↓ abre · enter fica" : "ctrl+e bots"}</p>
				<p>ctrl+o detalhe: {level}</p>
			</footer>
		</nav>
	);
}
