import type { RouteHandlerArgs, Session } from "eve/channels";
import type { Bot } from "../bots";
import { listActions } from "./actions";
import { saveBot, updateBot } from "./bots";
import { listRoutines } from "./routines";
import { readSessionEvents, writeSessionArchive } from "./session-history";

async function replaceSession(bot: Bot, session: Session, channel: Pick<RouteHandlerArgs, "from">, message: string) {
	const events = await readSessionEvents(session);
	const [routines, actions] = await Promise.all([
		listRoutines(bot.id),
		listActions({ sessionId: session.id, limit: Number.MAX_SAFE_INTEGER }),
	]);
	const path = await writeSessionArchive({
		botId: bot.id,
		sessionId: session.id,
		data: { bot, sessionId: session.id, archivedAt: new Date().toISOString(), routines, actions, events },
	});
	const prepared = { ...bot, previousSessionId: session.id, memorySessionId: bot.memorySessionId ?? session.id };
	await saveBot(prepared);
	const previousMessage = events.findLast((event) => event.type === "message.received")?.data.message;
	const created = await channel.from(bot.id).send(message, {
		auth: null,
		title: bot.name,
		turnPolicy: "queue",
		context: [
			`Esta é uma nova sessão do mesmo bot. A anterior ${session.id} foi encerrada. O arquivo completo está em ${path}. Use search_history e read_history para consultar qualquer sessão anterior quando necessário. Memória e rotinas foram preservadas. O modo começa normal; aprovações anteriores não foram retomadas.`,
			...(previousMessage ? [`Última mensagem registrada na sessão anterior, como referência histórica: ${JSON.stringify(previousMessage)}. Siga a mensagem atual da pessoa; consulte o histórico se ela se referir ao trabalho anterior, conferindo resultados antes de repetir ações.`] : []),
		],
	});
	return { ...prepared, sessionId: created.id };
}

export async function sendBotMessage(input: { id: string; message: string }, channel: Pick<RouteHandlerArgs, "from" | "resolveSession" | "attachSession">) {
	return await updateBot(input.id, async (bot) => {
		const session = bot.sessionId ? channel.attachSession(bot.sessionId) : await channel.resolveSession(bot.id);
		if (!session) {
			const created = await channel.from(bot.id).send(input.message, { auth: null, title: bot.name });
			return { ...bot, sessionId: created.id };
		}
		const result = await session.send(input.message, { auth: null, turnPolicy: "queue" });
		if (result.status === "accepted") {
			return { ...bot, sessionId: session.id };
		}
		return await replaceSession(bot, session, channel, input.message);
	});
}
