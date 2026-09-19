import { useQuery } from "@tanstack/react-query";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Bar } from "./bar";
import { Composer } from "./composer";
import { useConversation } from "./conversation";
import { orpc } from "./rpc";
import { DETAIL_LEVELS, type Detail, Transcript } from "./transcript";

const LAST_BOT = "mimo:bot";

interface ConversationProps {
	bot: { id: string; name: string };
	level: Detail;
	input: RefObject<HTMLTextAreaElement | null>;
}

function Conversation({ bot, level, input }: ConversationProps) {
	const [conversation, apply] = useConversation(bot.id);

	return (
		<main className="conversation">
			<Transcript conversation={conversation} level={level} name={bot.name} />
			<Composer
				botId={bot.id}
				name={bot.name}
				working={conversation.turn !== "idle"}
				input={input}
				fail={(message) => apply([{ type: "turn-failed", message }])}
			/>
		</main>
	);
}

export function App() {
	const bots = useQuery(orpc.bots.list.queryOptions());
	const [chosen, setChosen] = useState(() => localStorage.getItem(LAST_BOT));
	const [level, setLevel] = useState<Detail>("brief");
	const input = useRef<HTMLTextAreaElement>(null);
	const bot = bots.data?.find((entry) => entry.id === chosen) ?? bots.data?.[0];
	const leave = useCallback(() => input.current?.focus(), []);

	useEffect(() => {
		function onKey(event: KeyboardEvent): void {
			if (event.ctrlKey && event.key.toLowerCase() === "o") {
				event.preventDefault();
				setLevel((current) => DETAIL_LEVELS[(DETAIL_LEVELS.indexOf(current) + 1) % DETAIL_LEVELS.length]);
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	function select(id: string): void {
		setChosen(id);
		localStorage.setItem(LAST_BOT, id);
	}

	return (
		<div className="app">
			<Bar selected={bot?.id} level={level} onSelect={select} onLeave={leave} />
			{bot && <Conversation key={bot.id} bot={bot} level={level} input={input} />}
			{bots.data?.length === 0 && <p className="welcome">Dê um nome ao seu primeiro bot na barra ao lado.</p>}
		</div>
	);
}
