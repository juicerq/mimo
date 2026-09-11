import { spawn, type Subprocess } from "bun";
import { watch } from "node:fs";
import { dirname, join } from "node:path";

const REPO_ROOT = dirname(import.meta.dir);
const TUI_ENTRY = join(REPO_ROOT, "apps", "mimo", "src", "index.ts");
const WATCHED = [join(REPO_ROOT, "apps", "mimo", "src"), join(REPO_ROOT, "apps", "agent", "src")];

function spawnTui(): Subprocess {
	return spawn({ cmd: [process.execPath, TUI_ENTRY], cwd: REPO_ROOT, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
}

let restarting = false;
let tui = spawnTui();
const watchers = WATCHED.map((path) => watch(path, { recursive: true }, () => {
	restarting = true;
	tui.kill();
}));

let exitCode = await tui.exited;
while (restarting) {
	restarting = false;
	tui = spawnTui();
	exitCode = await tui.exited;
}

for (const watcher of watchers) {
	watcher.close();
}

process.exit(exitCode);
