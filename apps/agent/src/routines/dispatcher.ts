import { Bot } from "../bot/bot";
import { claimDue, completeRoutine, failRoutine } from "./routines";

const TICK_MS = 60_000;
const DISPATCH_LIMIT = 10;

async function dispatchDue(): Promise<void> {
	for (const routine of await claimDue(new Date(), DISPATCH_LIMIT)) {
		try {
			const bot = await Bot.open(routine.botId);
			await bot.send(routine.prompt);
			await completeRoutine(routine.id, new Date());
		} catch (error) {
			await failRoutine(routine.id, error);
		}
	}
}

export function startRoutines(): () => void {
	const tick = () => {
		void dispatchDue().catch(() => {});
	};
	const timer = setInterval(tick, TICK_MS);
	tick();
	return () => clearInterval(timer);
}
