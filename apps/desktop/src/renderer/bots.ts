import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type Outputs, orpc } from "./rpc";

type Activity = Outputs["bots"]["activity"][number];

export type State = "failed" | "waiting" | "working" | "idle";

export interface BotRow {
	id: string;
	name: string;
	state: State;
	last: Activity["last"];
	at: number;
}

function stateOf(live: Activity | undefined): State {
	if (!live) {
		return "idle";
	}
	if (live.failed !== null) {
		return "failed";
	}
	if (live.waiting !== null) {
		return "waiting";
	}
	if (live.busy) {
		return "working";
	}
	return "idle";
}

export function useBots() {
	const list = useQuery(orpc.bots.list.queryOptions());
	const activity = useQuery(orpc.bots.activity.queryOptions({ refetchInterval: 1000 }));

	const bots = useMemo(() => {
		const live = new Map(activity.data?.map((entry) => [entry.id, entry]));
		return list.data
			?.map((bot): BotRow => {
				const entry = live.get(bot.id);
				const last = entry?.last ?? bot.last;
				return { id: bot.id, name: bot.name, state: stateOf(entry), last, at: last?.at ?? Date.parse(bot.createdAt) };
			})
			.sort((left, right) => right.at - left.at);
	}, [list.data, activity.data]);

	return { bots, error: list.error };
}
