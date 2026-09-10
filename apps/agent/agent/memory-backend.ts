import { createHash } from "node:crypto";
import { join } from "node:path";
import { MemoryDocumentConflictError, type MemoryDocument, type MemoryDocumentBackend } from "eve/memory/file";
import { readTextFile, writeTextFile } from "./lib/files";

const MEMORY_DIR = join(process.cwd(), ".data", "memory");

function versionOf(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function documentPath(key: string): string {
	return join(MEMORY_DIR, `${key}.md`);
}

async function readDocument(key: string): Promise<MemoryDocument | null> {
	const content = await readTextFile(documentPath(key));
	if (content === null) {
		return null;
	}
	return { content, version: versionOf(content) };
}

export function localMemoryBackend(): MemoryDocumentBackend {
	return {
		async read({ key, signal }) {
			signal.throwIfAborted();
			return readDocument(key);
		},
		async write({ key, content, signal, expectedVersion }) {
			signal.throwIfAborted();
			const current = await readDocument(key);
			if ((current?.version ?? null) !== expectedVersion) {
				throw new MemoryDocumentConflictError(key);
			}
			await writeTextFile(documentPath(key), content);
			return { content, version: versionOf(content) };
		},
	};
}
