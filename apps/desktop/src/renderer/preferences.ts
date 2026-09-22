import { rpc, type Outputs } from "./rpc";

type Preferences = Outputs["preferences"]["read"];
let saved: Preferences = {};

export async function loadPreferences(): Promise<void> {
	saved = await rpc.preferences.read();
}

export function preference<Key extends keyof Preferences>(key: Key): Preferences[Key] {
	return saved[key];
}

export function savePreference<Key extends keyof Preferences>(key: Key, value: Preferences[Key]): void {
	saved = { ...saved, [key]: value };
	void rpc.preferences.save({ [key]: value }).catch((error: unknown) => console.error("Preference could not be saved", error));
}
