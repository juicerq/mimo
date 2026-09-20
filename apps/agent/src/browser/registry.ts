import { BrowserSession, type BrowserEvent, type BrowserView } from "./browser";

export interface BrowserActivity {
	botId: string;
	event: BrowserEvent;
}

const sessions = new Map<string, BrowserSession>();
const watchers = new Set<(activity: BrowserActivity) => void>();
let makeView: (() => BrowserView) | null = null;

export function installBrowser(make: () => BrowserView): void {
	makeView = make;
}

export function browserFor(botId: string): BrowserSession {
	const live = sessions.get(botId);
	if (live) {
		return live;
	}
	const make = makeView;
	if (!make) {
		throw new Error("O navegador não está disponível aqui.");
	}
	const session = new BrowserSession(make, () => sessions.delete(botId));
	sessions.set(botId, session);
	session.subscribe((event) => {
		for (const watcher of watchers) {
			watcher({ botId, event });
		}
	});
	return session;
}

export function browserSession(botId: string): BrowserSession | null {
	return sessions.get(botId) ?? null;
}

export function closeBrowser(botId: string): void {
	sessions.get(botId)?.close();
}

export function watchBrowsers(watcher: (activity: BrowserActivity) => void): () => void {
	for (const [botId, session] of sessions) {
		for (const event of session.past) {
			watcher({ botId, event });
		}
	}
	watchers.add(watcher);
	return () => {
		watchers.delete(watcher);
	};
}
