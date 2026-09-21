import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Empty, EmptyDescription } from "@renderer/components/ui/empty";
import { Bar } from "./bar";
import { type BotRow, useBots } from "./bots";
import { Browsers } from "./browsing";
import { Composer } from "./composer";
import { useConversation } from "./conversation";
import { Head } from "./head";
import { Info, useInfoPanel } from "./info";
import { Viewer } from "./preview";
import { DETAIL_LEVELS, type Detail, Transcript } from "./transcript";

const LAST_BOT = "mimo:bot";
const DETAIL = "mimo:detail";

export interface Thread {
	botId: string;
	askedBy: string;
	peer: string;
	asker: string;
}

function savedDetail(): Detail {
	return DETAIL_LEVELS.find((level) => level === localStorage.getItem(DETAIL)) ?? "brief";
}

function liveThread(thread: Thread | null, bots: BotRow[] | undefined): Thread | null {
	if (!thread || !bots) {
		return thread;
	}
	if (bots.some((entry) => entry.id === thread.botId) && bots.some((entry) => entry.id === thread.askedBy)) {
		return thread;
	}
	return null;
}

interface ConversationProps {
	bot: BotRow;
	level: Detail;
	input: RefObject<HTMLTextAreaElement | null>;
	onPeer: (peer: string) => void;
}

function Conversation({ bot, level, input, onPeer }: ConversationProps) {
	const [conversation, apply] = useConversation(bot.id);
	const fail = useCallback((message: string) => apply([{ type: "turn-failed", message }]), [apply]);

	return (
		<Transcript conversation={conversation} level={level} name={bot.name} botId={bot.id} onPeer={onPeer}>
			<Composer botId={bot.id} name={bot.name} working={conversation.turn !== "idle"} input={input} fail={fail} />
		</Transcript>
	);
}

function PeerConversation({ thread, level, onPeer }: { thread: Thread; level: Detail; onPeer: (peer: string) => void }) {
	const [conversation] = useConversation(thread.botId, thread.askedBy);

	return (
		<Transcript conversation={conversation} level={level} name={thread.peer} botId={thread.botId} onPeer={onPeer}>
			<p className="column pt-2 pb-5 text-center text-xs text-muted-foreground short:pb-2.5">
				{thread.asker} e {thread.peer} conversam aqui. Você só lê.
			</p>
		</Transcript>
	);
}

export function App() {
	const { bots, error } = useBots();
	const [chosen, setChosen] = useState(() => localStorage.getItem(LAST_BOT));
	const [level, setLevel] = useState(savedDetail);
	const [chosenThread, setThread] = useState<Thread | null>(null);
	const { open: infoOpen, overlay, toggle: toggleInfo, close: closeInfo } = useInfoPanel();
	const input = useRef<HTMLTextAreaElement>(null);
	const bot = bots?.find((entry) => entry.id === chosen) ?? bots?.[0];
	const thread = liveThread(chosenThread, bots);
	const focusComposer = useCallback(() => input.current?.focus(), []);

	useEffect(() => {
		localStorage.setItem(DETAIL, level);
	}, [level]);

	const openPeer = useCallback(
		(from: { id: string; name: string }, peer: string) => {
			const target = bots?.find((entry) => entry.name.toLowerCase() === peer.toLowerCase());
			if (target) {
				setThread({ botId: target.id, askedBy: from.id, peer: target.name, asker: from.name });
			}
		},
		[bots],
	);

	function select(id: string): void {
		setChosen(id);
		setThread(null);
		localStorage.setItem(LAST_BOT, id);
	}

	return (
		<Browsers>
		<div className="flex h-screen">
			<Bar bots={bots} error={error} selected={bot?.id} onSelect={select} focusComposer={focusComposer} level={level} onLevel={setLevel} />
			<div className="flex min-w-0 flex-1 flex-col">
				<Head bot={bot} thread={thread} onBack={() => setThread(null)} info={infoOpen} onInfo={toggleInfo} />
				<div className="flex min-h-0 flex-1">
					<main className="flex min-w-0 flex-1 flex-col">
						{thread && (
							<PeerConversation
								key={`${thread.botId}:${thread.askedBy}`}
								thread={thread}
								level={level}
								onPeer={(peer) => openPeer({ id: thread.botId, name: thread.peer }, peer)}
							/>
						)}
						{!thread && bot && <Conversation key={bot.id} bot={bot} level={level} input={input} onPeer={(peer) => openPeer(bot, peer)} />}
						{bots?.length === 0 && (
							<Empty>
								<EmptyDescription>Dê um nome ao seu primeiro bot na barra ao lado.</EmptyDescription>
							</Empty>
						)}
					</main>
					{bot && !thread && <Info botId={bot.id} name={bot.name} open={infoOpen} overlay={overlay} onClose={closeInfo} />}
				</div>
			</div>
			<Viewer bots={bots} />
		</div>
		</Browsers>
	);
}
