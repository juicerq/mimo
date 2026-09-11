import { Client } from "eve/client";
import { z } from "zod";
import { BotSchema } from "../agent/bots";

const AGENT_URL = process.env.MIMO_AGENT_URL ?? "http://127.0.0.1:2000";
const RUNS = z.coerce.number().int().positive().parse(process.env.BENCH_RUNS ?? 3);
const PROMPT = process.env.BENCH_PROMPT ?? "Responda apenas: ok";

interface Sample {
	botId: string;
	ms: number;
	events: number;
	inputTokens: number;
}

async function postBot(client: Client, path: string, body: { name: string } | { message: string }) {
	const response = await client.fetch(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		throw new Error(`Benchmark request failed: HTTP ${response.status}`);
	}
	return BotSchema.parse(await response.json());
}

async function timeTurn(prompt: string): Promise<Sample> {
	const client = new Client({ host: AGENT_URL });
	const started = performance.now();
	const created = await postBot(client, "/mimo/bots", { name: "Benchmark" });
	const bot = await postBot(client, `/mimo/bots/${created.id}/messages`, { message: prompt });
	if (!bot.sessionId) {
		throw new Error("The benchmark bot has no session after sending a message.");
	}
	let events = 0;
	let inputTokens = 0;
	for await (const event of client.sessions.attach(bot.sessionId).stream()) {
		events += 1;
		if (event.type === "step.failed" || event.type === "turn.failed" || event.type === "session.failed") {
			throw new Error(event.data.message);
		}
		if (event.type === "input.requested" || event.type === "turn.cancelled" || event.type === "session.completed") {
			throw new Error(`The benchmark stopped without a complete response: ${event.type}`);
		}
		if (event.type === "step.completed" && event.data.usage?.inputTokens) {
			inputTokens += event.data.usage.inputTokens;
		}
		if (event.type === "turn.completed") {
			return { botId: bot.id, ms: performance.now() - started, events, inputTokens };
		}
	}
	throw new Error("The benchmark stream ended before the turn completed.");
}

const info = await fetch(new URL("/eve/v1/info", AGENT_URL));
const infoBytes = (await info.arrayBuffer()).byteLength;

const samples: Sample[] = [];
for (let index = 0; index < RUNS; index += 1) {
	samples.push(await timeTurn(PROMPT));
}

const times = samples.map((sample) => sample.ms).sort((first, second) => first - second);
const median = times[Math.floor(times.length / 2)] ?? 0;

console.log(
	JSON.stringify(
		{
			url: AGENT_URL,
			infoBytes,
			medianMs: Math.round(median),
			runs: samples.map((sample) => ({
				botId: sample.botId,
				ms: Math.round(sample.ms),
				events: sample.events,
				inputTokens: sample.inputTokens,
			})),
		},
		null,
		"\t",
	),
);
