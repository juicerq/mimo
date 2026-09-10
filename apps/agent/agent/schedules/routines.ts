import { Client } from "eve/client";
import { defineSchedule } from "eve/schedules";
import { claimDue, completeRoutine, failRoutine } from "../lib/routines";

const DISPATCH_LIMIT = 10;

export default defineSchedule({
	cron: "* * * * *",
	run({ waitUntil }) {
		waitUntil(dispatchDue());
	},
});

async function dispatchDue(): Promise<void> {
	const client = new Client({ host: process.env.MIMO_AGENT_URL ?? "http://127.0.0.1:2000" });
	const due = await claimDue(new Date(), DISPATCH_LIMIT);
	for (const routine of due) {
		try {
			await client.sessions.attach(routine.sessionId).send(routine.prompt);
			await completeRoutine(routine.id, new Date());
		} catch (error) {
			await failRoutine(routine.id, error);
		}
	}
}
