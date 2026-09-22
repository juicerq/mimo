import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Entry } from "../bot/events";
import type { BotEvent, Interruption } from "../bot/types";

export const imports = sqliteTable("imports", { name: text().primaryKey() });

export const bots = sqliteTable("bots", {
	id: text().primaryKey(),
	name: text().notNull(),
	createdAt: text().notNull(),
	provider: text().notNull(),
	modelId: text().notNull(),
	reasoning: text().notNull(),
	prompt: text(),
}, (table) => [uniqueIndex("bot_name").on(sql`lower(${table.name})`)]);

export const conversations = sqliteTable("conversations", {
	id: text().primaryKey(),
	botId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
	askedBy: text().references(() => bots.id, { onDelete: "cascade" }),
});

export const turns = sqliteTable("turns", {
	seq: integer().primaryKey({ autoIncrement: true }),
	id: text().notNull().unique(),
	conversationId: text().notNull().references(() => conversations.id, { onDelete: "cascade" }),
	status: text({ enum: ["running", "stopping", "finished", "failed", "interrupted"] }).notNull(),
	finalSpeech: text(),
	interruptedBy: text().$type<Interruption>(),
	failure: text(),
	startedAt: integer().notNull(),
}, (table) => [
	uniqueIndex("active_turn").on(table.conversationId).where(sql`${table.status} in ('running', 'stopping')`),
	check("turn_status", sql`${table.status} in ('running', 'stopping', 'finished', 'failed', 'interrupted')`),
]);

export const messages = sqliteTable("messages", {
	seq: integer().primaryKey({ autoIncrement: true }),
	conversationId: text().notNull().references(() => conversations.id, { onDelete: "cascade" }),
	id: text().notNull(),
	message: text({ mode: "json" }).$type<AgentMessage>().notNull(),
}, (table) => [uniqueIndex("message_identity").on(table.conversationId, table.id)]);

export const records = sqliteTable("records", {
	seq: integer().primaryKey({ autoIncrement: true }),
	conversationId: text().notNull().references(() => conversations.id, { onDelete: "cascade" }),
	id: text().notNull(),
	turnId: text().references(() => turns.id, { onDelete: "cascade" }),
	at: integer().notNull(),
	kind: text().$type<Exclude<BotEvent, { type: "login" }>["type"]>().notNull(),
	event: text({ mode: "json" }).$type<Exclude<BotEvent, { type: "login" }>>().notNull(),
}, (table) => [uniqueIndex("record_identity").on(table.conversationId, table.id), index("record_order").on(table.conversationId, table.seq), index("record_kind").on(table.conversationId, table.kind, table.seq)]);

export const deliveries = sqliteTable("deliveries", {
	seq: integer().primaryKey({ autoIncrement: true }),
	conversationId: text().notNull().references(() => conversations.id, { onDelete: "cascade" }),
	id: text().notNull(),
	entry: text({ mode: "json" }).$type<Entry>().notNull(),
	turnId: text().notNull().references(() => turns.id, { onDelete: "cascade" }),
}, (table) => [uniqueIndex("delivery_identity").on(table.conversationId, table.id)]);

export const speeches = sqliteTable("speeches", {
	conversationId: text().notNull().references(() => conversations.id, { onDelete: "cascade" }),
	turnId: text().notNull().references(() => turns.id, { onDelete: "cascade" }),
	callId: text().notNull(),
	text: text().notNull(),
	done: integer({ mode: "boolean" }).notNull(),
}, (table) => [primaryKey({ columns: [table.conversationId, table.callId] })]);

export const routines = sqliteTable("routines", {
	id: text().primaryKey(),
	botId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
	name: text().notNull(),
	prompt: text().notNull(),
	everyMinutes: integer().notNull(),
	createdAt: text().notNull(),
	nextRunAt: text().notNull(),
	lastRunAt: text(),
	lastError: text(),
	enabled: integer({ mode: "boolean" }).notNull(),
}, (table) => [uniqueIndex("routine_name").on(table.botId, table.name)]);

export const memories = sqliteTable("memories", {
	botId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
	position: integer().notNull(),
	text: text().notNull(),
}, (table) => [primaryKey({ columns: [table.botId, table.position] }), uniqueIndex("memory_text").on(table.botId, table.text)]);

export const actions = sqliteTable("actions", {
	seq: integer().primaryKey({ autoIncrement: true }),
	at: text().notNull(),
	kind: text().notNull(),
	botId: text().notNull(),
	account: text(),
	summary: text().notNull(),
	result: text({ enum: ["ok", "failed"] }).notNull(),
	detail: text({ mode: "json" }).$type<Record<string, string>>().notNull(),
	error: text(),
});

export const preferences = sqliteTable("preferences", { key: text().primaryKey(), value: text().notNull() });

export const compactions = sqliteTable("compactions", {
	seq: integer().primaryKey({ autoIncrement: true }),
	conversationId: text().notNull().references(() => conversations.id, { onDelete: "cascade" }),
	start: integer().notNull(),
	summary: text({ mode: "json" }).$type<AgentMessage>().notNull(),
});
