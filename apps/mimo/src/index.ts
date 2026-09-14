#!/usr/bin/env bun
import { CliRenderEvents, createCliRenderer } from "@opentui/core";
import { startRoutines } from "@agent/routines/dispatcher";
import { loadEnv } from "@agent/storage/home";
import pkg from "../package.json";
import { MimoApp } from "./app";

async function main(): Promise<void> {
	loadEnv();
	if (process.argv.includes("--version") || process.argv.includes("-v")) {
		console.log(`mimo ${pkg.version}`);
		return;
	}
	const renderer = await createCliRenderer({
		exitOnCtrlC: true,
		backgroundColor: "#0B0B0C",
	});
	const stopRoutines = startRoutines();
	renderer.on(CliRenderEvents.DESTROY, () => {
		stopRoutines();
		process.exit(0);
	});
	const app = new MimoApp(renderer);
	await app.start();
}

await main();
