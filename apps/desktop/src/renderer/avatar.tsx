import { Blobatar } from "blobatar/react";
import { type Expression, idle, sad, surprised, thinking } from "blobatar/expression";
import { cn } from "@renderer/lib/utils";
import type { State } from "./bots";

const FACES: Record<State, Expression> = { failed: sad, waiting: surprised, working: thinking, idle };

const PRESENCE: Record<State, string | null> = { failed: "bg-destructive", waiting: "bg-warning", working: "bg-info", idle: null };

export const STATE_LABELS: Record<State, string> = { failed: "falhou", waiting: "esperando aprovação", working: "trabalhando", idle: "parado" };

export function Avatar({ name, state, size }: { name: string; state: State; size: number }) {
	const presence = PRESENCE[state];

	return (
		<span className="relative shrink-0" aria-hidden>
			<Blobatar name={name} size={size} expression={FACES[state]} />
			{presence && <span className={cn("absolute right-[12%] bottom-[12%] size-1/5 rounded-full ring-2 ring-(--surface)", presence)} />}
		</span>
	);
}
