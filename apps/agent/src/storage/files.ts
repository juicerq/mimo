import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

function isMissing(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function readTextFile(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (isMissing(error)) {
			return null;
		}
		throw error;
	}
}

export function readTextFileSync(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		if (isMissing(error)) {
			return null;
		}
		throw error;
	}
}

export async function readJsonFile<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
	const raw = await readTextFile(path);
	if (raw === null) {
		return null;
	}
	return schema.parse(JSON.parse(raw));
}

export async function writeTextFile(path: string, content: string, mode = 0o644): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${randomUUID()}.tmp`;
	await writeFile(temporary, content, { mode });
	await rename(temporary, path);
}

export async function writeBinaryFile(path: string, bytes: Uint8Array, mode = 0o600): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${randomUUID()}.tmp`;
	await writeFile(temporary, bytes, { mode });
	await rename(temporary, path);
}

export async function appendJsonLine(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await appendFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}
