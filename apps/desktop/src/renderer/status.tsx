import { StopIcon } from "@heroicons/react/20/solid";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Conversation, Turn } from "./conversation";
import { orpc } from "./rpc";

const TURN_LABELS: Record<Turn, string | null> = { idle: null, thinking: "Pensando", working: "Trabalhando", waiting: null };

export function turnLabel(conversation: Pick<Conversation, "turn" | "streaming">): string | null {
	if (conversation.turn !== "idle" && conversation.streaming) {
		return "Respondendo";
	}
	return TURN_LABELS[conversation.turn];
}

function clock(seconds: number): string {
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function Status({ botId, label }: { botId: string; label: string }) {
	const [startedAt] = useState(() => Date.now());
	const [now, setNow] = useState(startedAt);
	const cancel = useMutation(orpc.conversation.cancel.mutationOptions());

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	return (
		<div className="dock">
			<div className="status">
				<span className="spinner" aria-hidden />
				<span className="what">{label}</span>
				<span className="timer">{clock(Math.floor((now - startedAt) / 1000))}</span>
				<button type="button" className="icon" aria-label="Parar" title="Parar o Turno e descartar a Fila" onClick={() => cancel.mutate({ botId })}>
					<StopIcon />
				</button>
			</div>
		</div>
	);
}
