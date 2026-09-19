import { Bot } from "@agent/bot/bot";
import { lastMessage } from "@agent/bot/events";
import { activity, runningBot } from "@agent/bot/registry";
import { createBot, listBots, readTranscript } from "@agent/bot/store";
import { BotNameSchema, type BotEvent } from "@agent/bot/types";
import { EventPublisher, ORPCError, os, ValidationError } from "@orpc/server";
import type { BrowserWindow } from "electron";
import { z } from "zod";

export type ScreenEvent = Exclude<BotEvent, { type: "login" }>;

const BotInput = z.object({ botId: z.uuid() });

const base = os.$context<{ window: BrowserWindow }>();

const agent = base.use(async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		if (error instanceof ORPCError && error.cause instanceof ValidationError) {
			throw new ORPCError("BAD_REQUEST", { message: error.cause.issues[0]?.message ?? error.message, cause: error });
		}
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

async function listedBots() {
	return await Promise.all((await listBots()).map(async (bot) => ({
		...bot,
		last: runningBot(bot.id)?.lastMessage ?? lastMessage(await readTranscript(bot.id).catch(() => [])),
	})));
}

async function* maximized(window: BrowserWindow, signal?: AbortSignal) {
	const publisher = new EventPublisher<{ maximized: boolean }>();
	const changes = publisher.subscribe("maximized", { ...signal && { signal } });
	const onMaximize = () => publisher.publish("maximized", true);
	const onUnmaximize = () => publisher.publish("maximized", false);
	window.on("maximize", onMaximize);
	window.on("unmaximize", onUnmaximize);
	try {
		yield window.isMaximized();
		for await (const state of changes) {
			yield state;
		}
	} finally {
		window.off("maximize", onMaximize);
		window.off("unmaximize", onUnmaximize);
	}
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
		list: agent.handler(listedBots),
		activity: agent.handler(activity),
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
	window: {
		minimize: base.handler(({ context }) => context.window.minimize()),
		maximize: base.handler(({ context }) => {
			if (context.window.isMaximized()) {
				context.window.unmaximize();
				return;
			}
			context.window.maximize();
		}),
		close: base.handler(({ context }) => context.window.close()),
		maximized: base.handler(({ context, signal }) => maximized(context.window, signal)),
	},
};

export type Router = typeof router;
