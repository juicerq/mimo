import { Chat } from "@agent/bot/chat";
import { lastMessage } from "@agent/bot/events";
import { activity, deleteBot, mainChat, updateBot } from "@agent/bot/registry";
import { createBot, listBots, readBot, readTranscript } from "@agent/bot/store";
import { BotNameSchema, BotPromptSchema, type BotEvent } from "@agent/bot/types";
import { browserSession, watchBrowsers, type BrowserActivity } from "@agent/browser/registry";
import { disconnectAccount, listAccounts } from "@agent/gmail/accounts";
import { LOGIN_TARGETS, LoginTargetSchema } from "@agent/login/login";
import { loginSession, startLogin, watchLogins, type LoginActivity } from "@agent/login/registry";
import { listModels, selectModel } from "@agent/model/catalog";
import { PROVIDER_NAMES, ModelSelectionSchema } from "@agent/model/types";
import { EventPublisher, ORPCError, os, ValidationError } from "@orpc/server";
import type { BrowserWindow } from "electron";
import { z } from "zod";

export type ScreenEvent = Exclude<BotEvent, { type: "login" }>;

const BotInput = z.object({ botId: z.uuid() });
const ChatInput = BotInput.extend({ askedBy: z.uuid().optional() });

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

function replay(chat: Chat): BotEvent[] {
	const events: BotEvent[] = [...chat.transcript(), { type: "queue", items: chat.queue }];
	if (chat.busy) {
		events.push({ type: "turn-started" });
	}
	if (chat.approval) {
		events.push({ type: "approval", approval: chat.approval });
	}
	if (chat.failed) {
		events.push({ type: "turn-failed", message: chat.failed });
	}
	return events;
}

async function listedBots() {
	return await Promise.all((await listBots()).map(async (bot) => ({
		...bot,
		last: mainChat(bot.id)?.lastMessage ?? lastMessage(await readTranscript({ botId: bot.id }).catch(() => [])),
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

async function* logins(signal?: AbortSignal) {
	const publisher = new EventPublisher<{ activity: LoginActivity }>({ maxBufferedEvents: Number.POSITIVE_INFINITY });
	const live = publisher.subscribe("activity", { ...signal && { signal } });
	const unwatch = watchLogins((activity) => publisher.publish("activity", activity));
	try {
		for await (const activity of live) {
			yield activity;
		}
	} finally {
		unwatch();
	}
}

async function* browsing(signal?: AbortSignal) {
	const publisher = new EventPublisher<{ activity: BrowserActivity }>({ maxBufferedEvents: Number.POSITIVE_INFINITY });
	const live = publisher.subscribe("activity", { ...signal && { signal } });
	const unwatch = watchBrowsers((activity) => publisher.publish("activity", activity));
	try {
		for await (const activity of live) {
			yield activity;
		}
	} finally {
		unwatch();
	}
}

async function* watch(chat: Chat, signal?: AbortSignal) {
	const publisher = new EventPublisher<{ event: ScreenEvent }>({ maxBufferedEvents: Number.POSITIVE_INFINITY });
	const live = publisher.subscribe("event", { ...signal && { signal } });
	const unsubscribe = chat.observe((event) => {
		if (onScreen(event)) {
			publisher.publish("event", event);
		}
	});
	try {
		yield replay(chat).filter(onScreen);
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
		delete: agent
			.input(BotInput)
			.handler(async ({ input }) => await deleteBot(input.botId)),
	},
	bot: {
		info: agent
			.input(BotInput)
			.handler(async ({ input }) => await readBot(input.botId)),
		models: agent.handler(async () => ({ ...(await listModels()), providerNames: PROVIDER_NAMES })),
		selectModel: agent
			.input(BotInput.extend({ model: ModelSelectionSchema }))
			.handler(async ({ input }) => await updateBot(input.botId, { model: selectModel(input.model) })),
		instruct: agent
			.input(BotInput.extend({ prompt: BotPromptSchema.or(z.literal("")) }))
			.handler(async ({ input }) => await updateBot(input.botId, { prompt: input.prompt || undefined })),
	},
	conversation: {
		watch: agent
			.input(ChatInput)
			.handler(async ({ input, signal }) => watch(await Chat.open(input), signal)),
		send: agent
			.input(BotInput.extend({ text: z.string().trim().min(1) }))
			.handler(async ({ input }) => {
				const chat = await Chat.open(input);
				await chat.send(input.text);
			}),
		answer: agent
			.input(BotInput.extend({ id: z.string().min(1), approved: z.boolean() }))
			.handler(async ({ input }) => {
				const chat = await Chat.open(input);
				chat.resolveApproval(input.id, input.approved);
			}),
		cancel: agent
			.input(BotInput)
			.handler(async ({ input }) => {
				const chat = await Chat.open(input);
				chat.cancel();
			}),
	},
	login: {
		targets: agent.handler(() => LOGIN_TARGETS),
		watch: agent.handler(({ signal }) => logins(signal)),
		start: agent
			.input(z.object({ target: LoginTargetSchema }))
			.handler(({ input }) => {
				startLogin(input.target);
			}),
		answer: agent
			.input(z.object({ target: LoginTargetSchema, text: z.string().min(1) }))
			.handler(({ input }) => {
				loginSession(input.target)?.answer(input.text);
			}),
		cancel: agent
			.input(z.object({ target: LoginTargetSchema }))
			.handler(({ input }) => {
				loginSession(input.target)?.cancel();
			}),
	},
	browser: {
		watch: agent.handler(({ signal }) => browsing(signal)),
		present: agent
			.input(BotInput.extend({ open: z.boolean() }))
			.handler(({ input }) => {
				browserSession(input.botId)?.present(input.open);
			}),
		answer: agent
			.input(BotInput.extend({ helped: z.boolean() }))
			.handler(({ input }) => {
				browserSession(input.botId)?.answer(input.helped);
			}),
	},
	accounts: {
		list: agent.handler(async () => (await listAccounts()).map((account) => account.email)),
		disconnect: agent
			.input(z.object({ email: z.string().min(1) }))
			.handler(async ({ input }) => await disconnectAccount(input.email)),
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
