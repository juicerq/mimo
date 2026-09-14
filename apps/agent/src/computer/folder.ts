import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export function workDir(folder: string | undefined): string {
	return folder ?? homedir();
}

export async function resolveFolder(input: string): Promise<string> {
	const path = input.startsWith("~") ? join(homedir(), input.slice(1)) : input;
	if (!isAbsolute(path)) {
		throw new Error("Dê o caminho inteiro, começando com / ou ~.");
	}
	const info = await stat(path).catch(() => null);
	if (!info) {
		throw new Error(`Não existe nada em ${path}.`);
	}
	if (!info.isDirectory()) {
		throw new Error(`${path} não é uma pasta.`);
	}
	return path;
}

