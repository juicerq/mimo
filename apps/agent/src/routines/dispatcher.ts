import { Bot } from "../bot/bot";
import { claimDue, completeRoutine, failRoutine, type Routine } from "./routines";

const TICK_MS = 60_000;
const DISPATCH_LIMIT = 10;

async function dispatch(routine: Routine): Promise<void> {
	try {
		const bot = await Bot.open(routine.botId);
		if (bot.busy) {
			return;
		}
		await bot.runRoutine({ name: routine.name, prompt: routine.prompt });
		await completeRoutine(routine.id, new Date());
	} catch (error) {
		await failRoutine(routine.id, error);
	}
}

async function dispatchDue(): Promise<void> {
	const due = await claimDue(new Date(), DISPATCH_LIMIT);
	await Promise.allSettled(due.map(dispatch));
}

export function startRoutines(): () => void {
	const tick = () => {
		void dispatchDue().catch(() => {});
	};
	const timer = setInterval(tick, TICK_MS);
	tick();
	return () => clearInterval(timer);
}
