import { Chat } from "../bot/chat";
import { claimDue, completeRoutine, failRoutine, type Routine } from "./routines";

const TICK_MS = 60_000;
const DISPATCH_LIMIT = 10;

async function dispatch(routine: Routine): Promise<void> {
	try {
		const chat = await Chat.open({ botId: routine.botId });
		if (chat.busy) {
			return;
		}
		await chat.runRoutine({ name: routine.name, prompt: routine.prompt });
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
