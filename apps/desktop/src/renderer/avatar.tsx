import { Blobatar } from "blobatar/react";
import { type Expression, idle, sad, surprised, thinking } from "blobatar/expression";
import type { State } from "./bots";

const FACES: Record<State, Expression> = { failed: sad, waiting: surprised, working: thinking, idle };

export const STATE_LABELS: Record<State, string> = { failed: "falhou", waiting: "esperando aprovação", working: "trabalhando", idle: "parado" };

export function Avatar({ name, state, size }: { name: string; state: State; size: number }) {
	return (
		<span className="av" aria-hidden>
			<Blobatar name={name} size={size} expression={FACES[state]} />
			<span className="presence" data-state={state} />
		</span>
	);
}
