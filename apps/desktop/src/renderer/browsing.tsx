import type { BrowserEvent } from "@agent/browser/browser";
import type { BrowserActivity } from "@agent/browser/registry";
import { createContext, use, useEffect, useReducer, type ReactNode } from "react";
import { rpc } from "./rpc";

export interface Browsing {
	url: string;
	title: string;
	photo: string | null;
	showing: boolean;
	asking: string | null;
}

type Browsers = Record<string, Browsing>;

const EMPTY: Browsers = {};

const START: Browsing = { url: "", title: "", photo: null, showing: false, asking: null };

const Watching = createContext<Browsers>(EMPTY);

function step(browsing: Browsing, event: BrowserEvent): Browsing {
	if (event.type === "page") {
		return { ...browsing, url: event.url, title: event.title, photo: event.photo };
	}
	if (event.type === "showing") {
		return { ...browsing, showing: event.open };
	}
	if (event.type === "asking") {
		return { ...browsing, asking: event.reason };
	}
	return START;
}

function apply(browsers: Browsers, activity: BrowserActivity): Browsers {
	if (activity.event.type === "closed") {
		const rest = { ...browsers };
		delete rest[activity.botId];
		return rest;
	}
	return { ...browsers, [activity.botId]: step(browsers[activity.botId] ?? START, activity.event) };
}

async function follow(signal: AbortSignal, record: (activity: BrowserActivity) => void): Promise<void> {
	for await (const activity of await rpc.browser.watch(undefined, { signal })) {
		record(activity);
	}
}

export function Browsers({ children }: { children: ReactNode }) {
	const [browsers, record] = useReducer(apply, EMPTY);

	useEffect(() => {
		const controller = new AbortController();
		void follow(controller.signal, record).catch(() => {});
		return () => controller.abort();
	}, []);

	return <Watching value={browsers}>{children}</Watching>;
}

export function useBrowsing(botId: string): Browsing | undefined {
	return use(Watching)[botId];
}

export function useShowing(): string | undefined {
	return Object.entries(use(Watching)).find(([, browsing]) => browsing.showing)?.[0];
}
