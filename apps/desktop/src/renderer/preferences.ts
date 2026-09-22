import { rpc, type Outputs } from "./rpc";

type Preferences = Outputs["preferences"]["read"];
let saved: Preferences = {};

export async function loadPreferences(): Promise<void> {
	const legacy = {
		"mimo:theme": localStorage.getItem("mimo:theme"),
		"mimo:detail": localStorage.getItem("mimo:detail"),
		"mimo:bot": localStorage.getItem("mimo:bot"),
		"mimo:info": localStorage.getItem("mimo:info"),
	};
	const theme = legacy["mimo:theme"];
	const detail = legacy["mimo:detail"];
	const info = legacy["mimo:info"];
	const bot = legacy["mimo:bot"];
	saved = await rpc.preferences.import({
		...(theme === "dark" || theme === "light") && { "mimo:theme": theme },
		...(detail === "brief" || detail === "full") && { "mimo:detail": detail },
		...(info === "open" || info === "closed") && { "mimo:info": info },
		...bot && { "mimo:bot": bot },
	});
}

export function preference<Key extends keyof Preferences>(key: Key): Preferences[Key] {
	return saved[key];
}

export function savePreference<Key extends keyof Preferences>(key: Key, value: Preferences[Key]): void {
	saved = { ...saved, [key]: value };
	void rpc.preferences.save({ [key]: value }).catch((error: unknown) => console.error("Preference could not be saved", error));
}
