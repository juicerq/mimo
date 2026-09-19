import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Empty, EmptyDescription } from "@renderer/components/ui/empty";
import { Bar } from "./bar";
import { type BotRow, useBots } from "./bots";
import { Composer } from "./composer";
import { useConversation } from "./conversation";
import { Head } from "./head";
import { Info, useInfoPanel } from "./info";
import { Status, turnLabel } from "./status";
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
			<Transcript conversation={conversation} level={level} name={bot.name}>
				{label && <Status botId={bot.id} label={label} />}
				<Composer
					botId={bot.id}
					name={bot.name}
					working={conversation.turn !== "idle"}
					input={input}
					fail={(message) => apply([{ type: "turn-failed", message }])}
				/>
			</Transcript>
		</>
	);
}

export function App() {
	const { bots, error } = useBots();
	const [chosen, setChosen] = useState(() => localStorage.getItem(LAST_BOT));
	const [level, setLevel] = useState(savedDetail);
	const { open: infoOpen, overlay, toggle: toggleInfo, close: closeInfo } = useInfoPanel();
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
		<div className="flex h-screen">
			<Bar bots={bots} error={error} selected={bot?.id} onSelect={select} onLeave={leave} />
			<div className="flex min-w-0 flex-1 flex-col">
				<Head bot={bot} info={infoOpen} onInfo={toggleInfo} />
				<div className="flex min-h-0 flex-1">
					<main className="flex min-w-0 flex-1 flex-col">
						{bot && <Conversation key={bot.id} bot={bot} level={level} input={input} />}
						{bots?.length === 0 && (
							<Empty>
								<EmptyDescription>Dê um nome ao seu primeiro bot na barra ao lado.</EmptyDescription>
							</Empty>
						)}
					</main>
					{bot && (
						<Info
							name={bot.name}
							open={infoOpen}
							overlay={overlay}
							level={level}
							onClose={closeInfo}
							onLevel={setLevel}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
