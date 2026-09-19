import { InformationCircleIcon, MinusIcon, Square2StackIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { Avatar, STATE_LABELS } from "./avatar";
import type { BotRow } from "./bots";
import { orpc, rpc } from "./rpc";

function WindowControls() {
	const maximized = useQuery(orpc.window.maximized.experimental_liveOptions());

	return (
		<div className="win">
			<button type="button" className="icon" aria-label="Minimizar" title="Minimizar" onClick={() => void rpc.window.minimize()}>
				<MinusIcon />
			</button>
			{maximized.data ? (
				<button type="button" className="icon" aria-label="Restaurar" title="Restaurar" onClick={() => void rpc.window.maximize()}>
					<Square2StackIcon />
				</button>
			) : (
				<button type="button" className="icon" aria-label="Maximizar" title="Maximizar" onClick={() => void rpc.window.maximize()}>
					<StopIcon />
				</button>
			)}
			<button type="button" className="icon close" aria-label="Fechar o app" title="Fechar" onClick={() => void rpc.window.close()}>
				<XMarkIcon />
			</button>
		</div>
	);
}

interface HeadProps {
	bot: BotRow | undefined;
	info: boolean;
	onInfo: () => void;
}

export function Head({ bot, info, onInfo }: HeadProps) {
	return (
		<header className="head">
			{bot && <Avatar name={bot.name} state={bot.state} size={38} />}
			<h2>
				{bot?.name}
				{bot && <span className="sr">, {STATE_LABELS[bot.state]}</span>}
			</h2>
			{bot && (
				<button type="button" className="icon" aria-pressed={info} aria-label={`Sobre ${bot.name}`} title="Sobre o bot (Ctrl+I)" onClick={onInfo}>
					<InformationCircleIcon />
				</button>
			)}
			<WindowControls />
		</header>
	);
}
