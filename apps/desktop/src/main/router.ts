import { Bot } from "@agent/bot/bot";
import { createBot, listBots } from "@agent/bot/store";
import { BotNameSchema, type BotEvent } from "@agent/bot/types";
import { EventPublisher, ORPCError, os } from "@orpc/server";
import { z } from "zod";

export type ScreenEvent = Exclude<BotEvent, { type: "login" }>;

const BotInput = z.object({ botId: z.uuid() });

const agent = os.use(async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		if (error instanceof ORPCError || !(error instanceof Error)) {
			throw error;
		}
		throw new ORPCError("AGENT_ERROR", { message: error.message, cause: error });
	}
});

function onScreen(event: BotEvent): event is ScreenEvent {
	return event.type !== "login";
}

function replay(bot: Bot): BotEvent[] {
	const events: BotEvent[] = [...bot.transcript(), { type: "queue", items: bot.queue }];
	if (bot.busy) {
		events.push({ type: "turn-started" });
	}
	if (bot.approval) {
		events.push({ type: "approval", approval: bot.approval });
	}
	if (bot.failed) {
		events.push({ type: "turn-failed", message: bot.failed });
	}
	return events;
}

async function* watch(bot: Bot, signal?: AbortSignal) {
	const publisher = new EventPublisher<{ event: ScreenEvent }>({ maxBufferedEvents: Number.POSITIVE_INFINITY });
	const live = publisher.subscribe("event", { ...signal && { signal } });
	const unsubscribe = bot.observe((event) => {
		if (onScreen(event)) {
			publisher.publish("event", event);
		}
	});
	try {
		yield replay(bot).filter(onScreen);
		for await (const event of live) {
			yield [event];
		}
	} finally {
		unsubscribe();
	}
}

export const router = {
	bots: {
		list: agent.handler(listBots),
		create: agent
			.input(z.object({ name: BotNameSchema }))
			.handler(async ({ input }) => await createBot({ name: input.name })),
	},
	conversation: {
		watch: agent
			.input(BotInput)
			.handler(async ({ input, signal }) => watch(await Bot.open(input.botId), signal)),
		send: agent
			.input(BotInput.extend({ text: z.string().trim().min(1) }))
			.handler(async ({ input }) => {
				const bot = await Bot.open(input.botId);
				await bot.deliver(input.text);
			}),
		cancel: agent
			.input(BotInput)
			.handler(async ({ input }) => {
				const bot = await Bot.open(input.botId);
				bot.cancel();
			}),
	},
};

export type Router = typeof router;
