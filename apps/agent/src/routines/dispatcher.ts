import { mainChat } from "../bot/registry";
import { Conversation } from "../conversation/conversation";
import { dueRoutines, completeRoutine, failRoutine, type Routine } from "./routines";

const TICK_MS = 60_000;
const DISPATCH_LIMIT = 10;

async function dispatch(routine: Routine): Promise<void> {
	try {
		const chat = await Conversation.open({ botId: routine.botId });
		if (chat.busy) {
			return;
		}
		const ran = await chat.runRoutine({ id: `${routine.id}:${routine.nextRunAt}`, name: routine.name, prompt: routine.prompt });
		if (ran) {
			await completeRoutine(routine.id, new Date());
		}
	} catch (error) {
		await failRoutine(routine.id, error);
	}
}

async function dispatchDue(): Promise<void> {
	const due = (await dueRoutines(new Date())).filter((routine) => !mainChat(routine.botId)?.busy).slice(0, DISPATCH_LIMIT);
	await Promise.allSettled(due.map(dispatch));
}

export function startRoutines(): () => void {
	const tick = () => {
		void dispatchDue().catch((error: unknown) => console.error("Routine dispatch failed", error));
	};
	const timer = setInterval(tick, TICK_MS);
	tick();
	return () => clearInterval(timer);
}
