import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { readTextFileSync } from "./files";

const HOME_DIR = ".mimo";
const ENV_FILE = ".env";

function mimoHome(): string {
	return join(homedir(), HOME_DIR);
}

function dataDir(): string {
	const configured = process.env.MIMO_DATA_DIR;
	if (!configured) {
		return mimoHome();
	}
	if (isAbsolute(configured)) {
		return configured;
	}
	return resolve(process.cwd(), configured);
}

export function dataPath(...segments: string[]): string {
	return join(dataDir(), ...segments);
}

function envEntry(line: string): { key: string; value: string } | null {
	const trimmed = line.trim();
	const split = trimmed.indexOf("=");
	if (trimmed.startsWith("#") || split <= 0) {
		return null;
	}
	return { key: trimmed.slice(0, split).trim(), value: trimmed.slice(split + 1).trim().replace(/^["']|["']$/g, "") };
}

export function loadEnv(): void {
	const text = readTextFileSync(join(mimoHome(), ENV_FILE));
	if (text === null) {
		return;
	}
	for (const line of text.split("\n")) {
		const entry = envEntry(line);
		if (entry && !process.env[entry.key]) {
			process.env[entry.key] = entry.value;
		}
	}
}
