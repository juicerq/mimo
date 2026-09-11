import { isAbsolute, join, resolve } from "node:path";

const DEFAULT_DIR = ".data";

function dataDir(): string {
	const configured = process.env.MIMO_DATA_DIR;
	if (!configured) {
		return join(process.cwd(), DEFAULT_DIR);
	}
	if (isAbsolute(configured)) {
		return configured;
	}
	return resolve(process.cwd(), configured);
}

export function dataPath(...segments: string[]): string {
	return join(dataDir(), ...segments);
}
