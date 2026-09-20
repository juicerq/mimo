import { LoginSession, type LoginEvent, type LoginTarget } from "./login";

export interface LoginActivity {
	target: LoginTarget;
	run: number;
	event: LoginEvent;
}

interface Running {
	run: number;
	session: LoginSession;
}

const running = new Map<LoginTarget, Running>();
const watchers = new Set<(activity: LoginActivity) => void>();
let runs = 0;

export function requestLogin(target: LoginTarget): LoginSession {
	const live = running.get(target);
	if (live && !live.session.over) {
		return live.session;
	}
	runs += 1;
	const run = runs;
	const session = new LoginSession(target);
	running.set(target, { run, session });
	session.subscribe((event) => {
		for (const watcher of watchers) {
			watcher({ target, run, event });
		}
	});
	return session;
}

export function startLogin(target: LoginTarget): LoginSession {
	const session = requestLogin(target);
	session.begin();
	return session;
}

export function loginSession(target: LoginTarget): LoginSession | null {
	return running.get(target)?.session ?? null;
}

export function watchLogins(watcher: (activity: LoginActivity) => void): () => void {
	for (const [target, live] of running) {
		if (live.session.over) {
			continue;
		}
		for (const event of live.session.past) {
			watcher({ target, run: live.run, event });
		}
	}
	watchers.add(watcher);
	return () => {
		watchers.delete(watcher);
	};
}
