import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type KeyboardEvent, useState } from "react";
import { useConversation } from "./conversation";
import { orpc } from "./rpc";

const TURN_LABELS = { idle: null, thinking: "pensando…", working: "trabalhando…", waiting: "esperando aprovação" } as const;

interface BotRef {
	id: string;
	name: string;
}

function errorText(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function Conversation({ bot }: { bot: BotRef }) {
	const conversation = useConversation(bot.id);
	const [draft, setDraft] = useState("");
	const send = useMutation(orpc.conversation.send.mutationOptions());
	const cancel = useMutation(orpc.conversation.cancel.mutationOptions());
	const status = TURN_LABELS[conversation.turn];

	function submit(): void {
		const text = draft.trim();
		if (!text) {
			return;
		}
		setDraft("");
		send.mutate({ botId: bot.id, text }, {
			onError: () => setDraft((current) => current || text),
		});
	}

	function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			submit();
		}
	}

	return (
		<main className="conversation">
			<div className="lines">
				<div>
					{conversation.lines.map((line, index) => (
						<p key={index} className={`line ${line.tone}`}>
							{line.tone === "you" && <span className="who">you: </span>}
							{line.tone === "reply" && <span className="who">{bot.name}: </span>}
							{line.text}
						</p>
					))}
					{conversation.streaming && (
						<p className="line reply">
							<span className="who">{bot.name}: </span>
							{conversation.streaming}
						</p>
					)}
					{!conversation.streaming && status && <p className="line detail">{status}</p>}
					{conversation.queue.map((item, index) => (
						<p key={index} className="line detail">
							na fila: {item}
						</p>
					))}
					{send.error && <p className="line alert">✗ {errorText(send.error)}</p>}
				</div>
			</div>
			<form
				className="composer"
				onSubmit={(event: FormEvent) => {
					event.preventDefault();
					submit();
				}}
			>
				<textarea
					autoFocus
					rows={3}
					value={draft}
					placeholder={`Fale com ${bot.name}`}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={onKeyDown}
				/>
				{conversation.turn !== "idle" && (
					<button type="button" onClick={() => cancel.mutate({ botId: bot.id })}>
						parar
					</button>
				)}
			</form>
		</main>
	);
}

export function App() {
	const queryClient = useQueryClient();
	const bots = useQuery(orpc.bots.list.queryOptions());
	const [selected, setSelected] = useState<BotRef | null>(null);
	const [name, setName] = useState("");
	const create = useMutation(orpc.bots.create.mutationOptions({
		onSuccess: async (bot) => {
			setName("");
			setSelected(bot);
			await queryClient.invalidateQueries({ queryKey: orpc.bots.list.key() });
		},
	}));

	return (
		<div className="app">
			<nav className="bots">
				{bots.data?.map((bot) => (
					<button
						key={bot.id}
						type="button"
						className={bot.id === selected?.id ? "bot selected" : "bot"}
						onClick={() => setSelected(bot)}
					>
						{bot.name}
					</button>
				))}
				<form
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate({ name });
					}}
				>
					<input value={name} placeholder="novo bot" onChange={(event) => setName(event.target.value)} />
				</form>
				{create.error && <p className="line alert">{errorText(create.error)}</p>}
			</nav>
			{selected && <Conversation key={selected.id} bot={selected} />}
		</div>
	);
}
