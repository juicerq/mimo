import { useMutation } from "@tanstack/react-query";
import { SquareIcon } from "lucide-react";
import { memo, useCallback } from "react";
import { IconButton } from "@renderer/components/icon-button";
import { Avatar } from "./avatar";
import type { Conversation, Turn } from "./conversation";
import { orpc } from "./rpc";

const TURN_LABELS: Record<Turn, string | null> = { idle: null, thinking: "Pensando", working: "Trabalhando", waiting: null };
const FACE = 28;
const REVEAL =
	"pointer-events-none absolute top-1/2 left-full flex -translate-y-1/2 items-center gap-2.5 pl-2.5 whitespace-nowrap opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100";

export function turnLabel(conversation: Pick<Conversation, "turn">): string | null {
	return TURN_LABELS[conversation.turn];
}

function clock(seconds: number): string {
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Elapsed() {
	const count = useCallback((node: HTMLSpanElement | null) => {
		if (!node) {
			return;
		}

		const startedAt = Date.now();
		node.textContent = clock(0);
		const timer = setInterval(() => {
			node.textContent = clock(Math.floor((Date.now() - startedAt) / 1000));
		}, 1000);

		return () => clearInterval(timer);
	}, []);

	return <span ref={count} className="text-xs text-muted-foreground tabular-nums" />;
}

export const Working = memo(function Working({ botId, name, label }: { botId: string | null; name: string; label: string }) {
	const cancel = useMutation(orpc.conversation.cancel.mutationOptions());

	return (
		<div className="group relative mt-5 flex w-fit items-center">
			<Avatar name={name} state="working" size={FACE} />
			<span className="sr-only">
				{name} {label}
			</span>
			<div className={REVEAL}>
				<span className="text-xs text-foreground">{label}</span>
				<Elapsed />
				{botId && (
					<IconButton label="Parar o Turno e descartar a Fila" side="top" onClick={() => cancel.mutate({ botId })}>
						<SquareIcon className="fill-current" />
					</IconButton>
				)}
			</div>
		</div>
	);
});
