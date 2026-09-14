import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dataPath } from "../storage/home";

const run = promisify(execFile);

export interface Worktree {
	folder: string;
	branch: string;
}

function branchName(name: string): string {
	return `mimo/${name.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}`;
}

async function isRepo(folder: string): Promise<boolean> {
	return await run("git", ["-C", folder, "rev-parse", "--git-dir"]).then(() => true, () => false);
}

export async function addWorktree(folder: string, botId: string, name: string): Promise<Worktree> {
	if (!await isRepo(folder)) {
		throw new Error(`${folder} não é um repositório git, então não dá para abrir uma cópia isolada.`);
	}
	const worktree = { folder: dataPath("worktrees", botId), branch: branchName(name) };
	await run("git", ["-C", folder, "worktree", "add", "-B", worktree.branch, worktree.folder]);
	return worktree;
}

export async function removeWorktree(botId: string): Promise<void> {
	const path = dataPath("worktrees", botId);
	await run("git", ["-C", path, "worktree", "remove", "--force", path]).catch(() => null);
}
