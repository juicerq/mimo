#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import pkg from "../package.json";
import { AgentChat } from "./agent";
import { MimoApp } from "./app";

async function main(): Promise<void> {
	if (process.argv.includes("--version") || process.argv.includes("-v")) {
		console.log(`mimo ${pkg.version}`);
		return;
	}
	const renderer = await createCliRenderer({
		exitOnCtrlC: true,
		backgroundColor: "#16181D",
	});
	const app = new MimoApp(renderer, new AgentChat());
	await app.start();
}

await main();
