import type { LoginEvent, LoginPrompt, LoginTarget } from "@agent/login/login";
import type { LoginActivity } from "@agent/login/registry";
import { useEffect, useReducer } from "react";
import { rpc } from "./rpc";

type LoginState = "asked" | "running" | "done" | "failed";

export interface Login {
	run: number;
	state: LoginState;
	notes: string[];
	url: { link: string; instructions: string | null } | null;
	prompt: LoginPrompt | null;
	failed: string | null;
	account: string | null;
}

export type Logins = Partial<Record<LoginTarget, Login>>;

const EMPTY: Logins = {};

function fresh(run: number): Login {
	return { run, state: "asked", notes: [], url: null, prompt: null, failed: null, account: null };
}

function step(login: Login, event: LoginEvent): Login {
	if (event.type === "asked") {
		return login;
	}
	if (event.type === "started") {
		return { ...login, state: "running" };
	}
	if (event.type === "info") {
		return { ...login, prompt: null, notes: [...login.notes, event.text] };
	}
	if (event.type === "url") {
		return { ...login, url: { link: event.url, instructions: event.instructions } };
	}
	if (event.type === "prompt") {
		return { ...login, prompt: event.prompt };
	}
	if (event.type === "failed") {
		return { ...login, state: "failed", prompt: null, failed: event.refused ? null : event.message };
	}
	return { ...login, state: "done", prompt: null, account: event.account };
}

function apply(logins: Logins, activity: LoginActivity): Logins {
	const previous = logins[activity.target];
	const login = previous?.run === activity.run ? previous : fresh(activity.run);

	return { ...logins, [activity.target]: step(login, activity.event) };
}

export function useLogins(): Logins {
	const [logins, record] = useReducer(apply, EMPTY);

	useEffect(() => {
		const controller = new AbortController();
		void follow(controller.signal, record).catch(() => {});
		return () => controller.abort();
	}, []);

	return logins;
}

async function follow(signal: AbortSignal, record: (activity: LoginActivity) => void): Promise<void> {
	for await (const activity of await rpc.login.watch(undefined, { signal })) {
		record(activity);
	}
}
