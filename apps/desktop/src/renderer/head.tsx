import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, CopyIcon, InfoIcon, MinusIcon, SquareIcon, XIcon } from "lucide-react";
import { IconButton } from "@renderer/components/icon-button";
import type { Thread } from "./app";
import { Avatar, STATE_LABELS } from "./avatar";
import type { BotRow } from "./bots";
import { orpc, rpc } from "./rpc";

function WindowControls() {
	const maximized = useQuery(orpc.window.maximized.experimental_liveOptions());

	return (
		<div className="ml-1 flex items-center gap-0.5">
			<IconButton label="Minimizar" onClick={() => void rpc.window.minimize()}>
				<MinusIcon />
			</IconButton>
			{maximized.data ? (
				<IconButton label="Restaurar" onClick={() => void rpc.window.maximize()}>
					<CopyIcon className="-scale-x-100" />
				</IconButton>
			) : (
				<IconButton label="Maximizar" onClick={() => void rpc.window.maximize()}>
					<SquareIcon />
				</IconButton>
			)}
			<IconButton
				label="Fechar o app"
				tip="Fechar"
				className="hover:bg-destructive hover:text-destructive-foreground dark:hover:bg-destructive"
				onClick={() => void rpc.window.close()}
			>
				<XIcon />
			</IconButton>
		</div>
	);
}

interface HeadProps {
	bot: BotRow | undefined;
	thread: Thread | null;
	onBack: () => void;
	info: boolean;
	onInfo: () => void;
}

export function Head({ bot, thread, onBack, info, onInfo }: HeadProps) {
	if (thread) {
		return (
			<header className="drag flex h-bar shrink-0 items-center gap-3 border-b pr-3 pl-3">
				<IconButton label="Voltar" onClick={onBack}>
					<ArrowLeftIcon />
				</IconButton>
				<Avatar name={thread.peer} state="idle" size={40} />
				<h2 className="min-w-0 flex-1 truncate text-base font-semibold">
					{thread.asker} e {thread.peer}
				</h2>
				<WindowControls />
			</header>
		);
	}

	return (
		<header className="drag flex h-bar shrink-0 items-center gap-3 border-b pr-3 pl-5">
			{bot && <Avatar name={bot.name} state={bot.state} size={40} />}
			<h2 className="min-w-0 flex-1 truncate text-base font-semibold">
				{bot?.name}
				{bot && <span className="sr-only">, {STATE_LABELS[bot.state]}</span>}
			</h2>
			{bot && (
				<IconButton label="Sobre o bot" aria-pressed={info} onClick={onInfo}>
					<InfoIcon />
				</IconButton>
			)}
			<WindowControls />
		</header>
	);
}
