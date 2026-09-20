import { disconnectAccount, listAccounts } from "@agent/gmail/accounts";
import { LOGIN_GROUP_NAMES, LOGIN_TARGETS, type LoginEvent, type LoginPrompt, type LoginSession, type LoginTarget } from "@agent/login/login";
import { startLogin } from "@agent/login/registry";
import { copyToClipboard } from "../clipboard";
import { CANCEL_HINT, choicePanel, type Panel, type PanelView } from "../panel";

export function loginTargetsPanel(): Panel {
	return choicePanel<LoginTarget>({
		heading: "login",
		load: () => ({
			choices: LOGIN_TARGETS.map((target) => ({
				id: target.id,
				label: `${target.name} · ${target.how}`,
				group: LOGIN_GROUP_NAMES[target.group],
			})),
		}),
		pick: (target, view) => view.show(loginPanel(target, startLogin(target))),
	});
}

export function loginPanel(target: LoginTarget, session: LoginSession): Panel {
	const name = LOGIN_TARGETS.find((option) => option.id === target)?.name ?? target;
	let url: string | null = null;
	let prompt: LoginPrompt | null = null;

	return {
		heading: `${name}  ·  login`,
		placeholder: "waiting",
		start(view) {
			session.begin();
			session.subscribe((event) => {
				if (event.type === "url") {
					url = event.url;
				}
				if (event.type === "prompt") {
					prompt = event.prompt;
				}
				showLoginEvent(event, target, view);
			});
		},
		submit(text, view) {
			if (!prompt) {
				return;
			}
			prompt = null;
			view.placeholder("waiting");
			view.state("loading");
			session.answer(text);
		},
		cancel() {
			session.cancel();
		},
		copy(view) {
			if (url === null) {
				return false;
			}
			void copyToClipboard(url).then(
				() => view.line("Link copied.", "note"),
				() => view.line("Could not copy the link.", "error"),
			);
			return true;
		},
	};
}

export function accountsPanel(): Panel {
	return choicePanel({
		heading: "logout",
		empty: "No Gmail account is connected.",
		load: async () => ({ choices: (await listAccounts()).map((account) => ({ id: account.email, label: account.email })) }),
		pick: (email, view) => {
			view.saving(async () => {
				const result = await disconnectAccount(email);
				const revoke = result.revoked ? "" : " Google did not confirm the revoke.";
				view.close({ message: `Disconnected ${result.email}.${revoke}` });
			});
		},
	});
}

function showLoginEvent(event: LoginEvent, target: LoginTarget, view: PanelView): void {
	if (event.type === "asked" || event.type === "started") {
		return;
	}
	if (event.type === "info") {
		view.line(event.text, "note");
		return;
	}
	if (event.type === "url") {
		view.line(event.url, "title", true);
		if (event.instructions) {
			view.line(event.instructions, "hint");
		}
		view.line("Press c to copy the link.", "hint");
		return;
	}
	if (event.type === "prompt") {
		view.line(event.prompt.message, "item", true);
		for (const [index, option] of event.prompt.options.entries()) {
			view.line(`${index + 1}. ${option.label}`, "item", true);
		}
		view.line(CANCEL_HINT, "hint");
		view.placeholder(event.prompt.kind === "select" ? "number or /cancel" : "type here or /cancel");
		view.state("ready");
		return;
	}
	if (event.type === "failed") {
		view.line(event.message, "error");
		view.state("ready");
		return;
	}
	const next = target === "gmail" ? "The bots can use this account now." : "Use /model to pick a model.";
	view.close({ message: `Connected. ${next}` });
}
