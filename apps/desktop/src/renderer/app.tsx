import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Bar } from "./bar";
import { type BotRow, useBots } from "./bots";
import { Composer } from "./composer";
import { useConversation } from "./conversation";
import { Head } from "./head";
import { Info, useInfoPanel } from "./info";
import { Status, turnLabel } from "./status";
import { useTheme } from "./theme";
import { DETAIL_LEVELS, type Detail, Transcript } from "./transcript";

const LAST_BOT = "mimo:bot";
const DETAIL = "mimo:detail";

function savedDetail(): Detail {
	return DETAIL_LEVELS.find((level) => level === localStorage.getItem(DETAIL)) ?? "brief";
}

interface ConversationProps {
	bot: BotRow;
	level: Detail;
	input: RefObject<HTMLTextAreaElement | null>;
}

function Conversation({ bot, level, input }: ConversationProps) {
	const [conversation, apply] = useConversation(bot.id);
	const label = turnLabel(conversation);

	return (
		<>
			<Transcript conversation={conversation} level={level} name={bot.name} />
			{label && <Status botId={bot.id} label={label} />}
			<Composer
				botId={bot.id}
				name={bot.name}
				working={conversation.turn !== "idle"}
				input={input}
				fail={(message) => apply([{ type: "turn-failed", message }])}
			/>
		</>
	);
}

export function App() {
	const { bots, error } = useBots();
	const [chosen, setChosen] = useState(() => localStorage.getItem(LAST_BOT));
	const [level, setLevel] = useState(savedDetail);
	const { open: infoOpen, toggle: toggleInfo, close: closeInfo } = useInfoPanel();
	const [theme, toggleTheme] = useTheme();
	const input = useRef<HTMLTextAreaElement>(null);
	const bot = bots?.find((entry) => entry.id === chosen) ?? bots?.[0];
	const leave = useCallback(() => input.current?.focus(), []);

	useEffect(() => {
		localStorage.setItem(DETAIL, level);
	}, [level]);

	useEffect(() => {
		function onKey(event: KeyboardEvent): void {
			if (event.key === "Escape") {
				closeInfo();
				return;
			}
			if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
				return;
			}
			const key = event.key.toLowerCase();
			if (key === "o") {
				event.preventDefault();
				setLevel((current) => DETAIL_LEVELS[(DETAIL_LEVELS.indexOf(current) + 1) % DETAIL_LEVELS.length]);
				return;
			}
			if (key === "i") {
				event.preventDefault();
				toggleInfo();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [toggleInfo, closeInfo]);

	function select(id: string): void {
		setChosen(id);
		localStorage.setItem(LAST_BOT, id);
	}

	return (
		<div className={infoOpen && bot ? "app info-open" : "app"}>
			<Bar bots={bots} error={error} selected={bot?.id} onSelect={select} onLeave={leave} />
			<Head bot={bot} info={infoOpen} onInfo={toggleInfo} />
			<main className="pane">
				{bot && <Conversation key={bot.id} bot={bot} level={level} input={input} />}
				{bots?.length === 0 && <p className="welcome">Dê um nome ao seu primeiro bot na barra ao lado.</p>}
			</main>
			{bot && (
				<>
					<div className="scrim" onClick={closeInfo} />
					<Info name={bot.name} level={level} theme={theme} onLevel={setLevel} onTheme={toggleTheme} />
				</>
			)}
		</div>
	);
}
