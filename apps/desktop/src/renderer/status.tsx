import { useMutation } from "@tanstack/react-query";
import { SquareIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "@renderer/components/icon-button";
import { Spinner } from "@renderer/components/ui/spinner";
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
		<div className="column flex min-h-10 items-center gap-2.5 text-xs text-muted-foreground">
			<Spinner className="text-info" aria-hidden />
			<span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
			<span className="shrink-0 tabular-nums">{clock(Math.floor((now - startedAt) / 1000))}</span>
			<IconButton label="Parar o Turno e descartar a Fila" side="top" onClick={() => cancel.mutate({ botId })}>
				<SquareIcon className="fill-current" />
			</IconButton>
		</div>
	);
}
