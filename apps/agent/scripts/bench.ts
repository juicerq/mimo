import { Client } from "eve/client";

const AGENT_URL = process.env.MIMO_AGENT_URL ?? "http://127.0.0.1:2000";
const RUNS = Number(process.env.BENCH_RUNS ?? 3);
const PROMPT = process.env.BENCH_PROMPT ?? "Responda apenas: ok";

interface Sample {
	ms: number;
	events: number;
	inputTokens: number;
}

async function timeTurn(prompt: string): Promise<Sample> {
	const client = new Client({ host: AGENT_URL });
	const started = performance.now();
	const { response } = await client.sessions.create({ message: prompt });
	let events = 0;
	let inputTokens = 0;
	for await (const event of response) {
		events += 1;
		if (event.type === "step.completed" && event.data.usage?.inputTokens) {
			inputTokens += event.data.usage.inputTokens;
		}
	}
	return { ms: performance.now() - started, events, inputTokens };
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
				ms: Math.round(sample.ms),
				events: sample.events,
				inputTokens: sample.inputTokens,
			})),
		},
		null,
		"\t",
	),
);
