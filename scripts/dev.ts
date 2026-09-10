import { closeSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { spawn, type Subprocess } from "bun";

const REPO_ROOT = join(import.meta.dir, "..");
const AGENT_DIR = join(REPO_ROOT, "apps", "agent");
const TUI_ENTRY = join(REPO_ROOT, "apps", "mimo", "src", "index.ts");
const AGENT_LOG = join(AGENT_DIR, ".eve", "dev-server.log");
const DEFAULT_AGENT_URL = "http://127.0.0.1:2000";
const HEALTH_TIMEOUT_MS = 90_000;
const HEALTH_POLL_MS = 500;
const HEALTH_REQUEST_TIMEOUT_MS = 2_000;

async function isHealthy(baseUrl: string): Promise<boolean> {
	try {
		const response = await fetch(new URL("/eve/v1/health", baseUrl), {
			signal: AbortSignal.timeout(HEALTH_REQUEST_TIMEOUT_MS),
		});
		return response.ok;
	} catch {
		return false;
	}
}

function isLocal(url: URL): boolean {
	return url.hostname === "127.0.0.1" || url.hostname === "localhost";
}

function spawnAgent(port: string): Subprocess {
	mkdirSync(join(AGENT_DIR, ".eve"), { recursive: true });
	const log = openSync(AGENT_LOG, "w");
	const cmd = [process.execPath, "x", "eve", "dev", "--no-ui"];
	if (port) {
		cmd.push("--port", port);
	}
	const agent = spawn({ cmd, cwd: AGENT_DIR, stdin: "ignore", stdout: log, stderr: log });
	closeSync(log);
	return agent;
}

async function waitForHealth(baseUrl: string, agent: Subprocess): Promise<boolean> {
	const deadline = Date.now() + HEALTH_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (await isHealthy(baseUrl)) {
			return true;
		}
		if (agent.exitCode !== null) {
			return false;
		}
		await Bun.sleep(HEALTH_POLL_MS);
	}
	return false;
}

async function main(): Promise<void> {
	const baseUrl = process.env.MIMO_AGENT_URL ?? DEFAULT_AGENT_URL;
	let url: URL;
	try {
		url = new URL(baseUrl);
	} catch {
		console.error(`MIMO_AGENT_URL inválida: ${baseUrl}`);
		process.exit(1);
	}

	let agent: Subprocess | null = null;
	if (!(await isHealthy(baseUrl))) {
		if (!isLocal(url)) {
			console.error(`agente não respondeu em ${baseUrl}`);
			process.exit(1);
		}
		console.error(`subindo o agente em ${baseUrl} · log: ${AGENT_LOG}`);
		agent = spawnAgent(url.port);
		if (!(await waitForHealth(baseUrl, agent))) {
			agent.kill();
			console.error(`agente não subiu. Veja o log: ${AGENT_LOG}`);
			process.exit(1);
		}
	}

	const tui = spawn({
		cmd: [process.execPath, TUI_ENTRY],
		cwd: REPO_ROOT,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await tui.exited;
	agent?.kill();
	process.exit(exitCode);
}

await main();
