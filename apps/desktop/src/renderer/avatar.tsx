import { useCallback } from "react";
import { cn } from "cn";
import type { State } from "./bots";
import { type Look, mountFace } from "./face";

const PRESENCE: Record<State, string | null> = { failed: "bg-destructive", waiting: "bg-warning", working: "bg-info", idle: null };

export const STATE_LABELS: Record<State, string> = { failed: "falhou", waiting: "esperando aprovação", working: "trabalhando", idle: "parado" };

export function Avatar({ name, state, size, look = "still" }: { name: string; state: State; size: number; look?: Look }) {
	const presence = PRESENCE[state];
	const attach = useCallback((svg: SVGSVGElement | null) => (svg ? mountFace(svg, name) : undefined), [name]);

	return (
		<span className="relative shrink-0" aria-hidden>
			<svg ref={attach} data-state={state} data-look={look} width={size} height={size} className="block" />
			{presence && <span className={cn("absolute right-[12%] bottom-[12%] size-1/5 rounded-full ring-2 ring-(--surface)", presence)} />}
		</span>
	);
}
