import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { writeTextFile } from "../storage/files";

const MAX_CHARACTERS = 20_000;
const MAX_ENTRIES = 200;
const MAX_MATCHES = 80;

export interface FileListing {
	path: string;
	entries: string[];
	truncated: boolean;
}

export interface FileContent {
	path: string;
	from: number;
	to: number;
	lines: number;
	text: string;
	truncated: boolean;
}

export interface FileMatches {
	path: string;
	matches: string[];
	truncated: boolean;
}

function resolvePath(path: string): string {
	const trimmed = path.trim();
	if (trimmed.startsWith("~")) {
		return join(homedir(), trimmed.slice(1));
	}
	if (isAbsolute(trimmed)) {
		return trimmed;
	}
	return resolve(homedir(), trimmed);
}

export async function listFiles(path: string): Promise<FileListing> {
	const target = resolvePath(path);
	const entries = await readdir(target, { withFileTypes: true });
	const names = entries.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name)).sort();

	return { path: target, entries: names.slice(0, MAX_ENTRIES), truncated: names.length > MAX_ENTRIES };
}

export async function readFileLines(path: string, from: number, limit: number | null): Promise<FileContent> {
	const target = resolvePath(path);
	const lines = (await Bun.file(target).text()).split("\n");
	const start = Math.max(from - 1, 0);
	const end = limit === null ? lines.length : Math.min(start + limit, lines.length);
	const text = lines.slice(start, end).join("\n");

	return {
		path: target,
		from: start + 1,
		to: end,
		lines: lines.length,
		text: text.slice(0, MAX_CHARACTERS),
		truncated: end < lines.length || text.length > MAX_CHARACTERS,
	};
}

export async function searchFiles(query: string, path: string): Promise<FileMatches> {
	const target = resolvePath(path);
	const command = Bun.which("rg")
		? ["rg", "--line-number", "--no-heading", "--color=never", "--max-count", "5", "--", query, target]
		: ["grep", "-rn", "--", query, target];
	const search = Bun.spawn(command, { stdout: "pipe", stderr: "ignore" });
	const output = await new Response(search.stdout).text();
	await search.exited;
	const matches = output.split("\n").filter((line) => line.length > 0);

	return { path: target, matches: matches.slice(0, MAX_MATCHES), truncated: matches.length > MAX_MATCHES };
}

export async function writeFile(path: string, content: string): Promise<{ path: string; bytes: number; existed: boolean }> {
	const target = resolvePath(path);
	const existed = await stat(target).then(() => true, () => false);
	await writeTextFile(target, content);

	return { path: target, bytes: Buffer.byteLength(content, "utf8"), existed };
}
