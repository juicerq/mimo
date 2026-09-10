import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MemoryDocumentConflictError, type MemoryDocumentBackend } from "eve/memory/file";

const MEMORY_DIR = join(process.cwd(), ".data", "memory");

function versionOf(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function isMissing(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function documentPath(key: string): string {
	return join(MEMORY_DIR, `${key}.md`);
}

async function readDocument(key: string): Promise<{ content: string; version: string } | null> {
	try {
		const content = await readFile(documentPath(key), "utf8");
		return { content, version: versionOf(content) };
	} catch (error) {
		if (isMissing(error)) {
			return null;
		}
		throw error;
	}
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
			await mkdir(MEMORY_DIR, { recursive: true });
			const target = documentPath(key);
			const temporary = `${target}.${randomUUID()}.tmp`;
			await writeFile(temporary, content, "utf8");
			await rename(temporary, target);
			return { content, version: versionOf(content) };
		},
	};
}
