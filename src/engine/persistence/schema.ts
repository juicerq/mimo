import { sql } from "drizzle-orm"
import { index, integer, primaryKey, snakeCase, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import type { StoredBot } from "@src/shared/bots"
import type { ConversationMessage } from "@src/shared/conversations"
import type { CurationModel, StoredMemory } from "@src/shared/memory"
import type { StoredAccount, StoredPlugin } from "@src/shared/plugins"
import type { Routine } from "@src/shared/routines"
import type { Task } from "@src/shared/tasks"
import type { Trigger, TriggerRun } from "@src/shared/triggers"
import type { JevVerification } from "@src/shared/jev"

export const jevSettings = snakeCase.table("jev_settings", {
  id: integer().primaryKey(),
  key: text().notNull(),
  verification: text({ mode: "json" }).$type<JevVerification>(),
})

export const projects = snakeCase.table("projects", {
  id: text().primaryKey(),
  name: text().notNull(),
  defaultWorkingDirectory: text(),
  createdAt: text().notNull(),
})

export const bots = snakeCase.table("bots", {
  id: text().primaryKey(),
  leaderBotId: text().references((): AnySQLiteColumn => bots.id, { onDelete: "cascade" }),
  projectId: text().references(() => projects.id, { onDelete: "set null" }),
  name: text().notNull(),
  avatarSeed: text().notNull(),
  provider: text().$type<StoredBot["provider"]>().notNull(),
  function: text({ mode: "json" }).$type<StoredBot["function"]>().notNull(),
  workingDirectoryOverride: text(),
  temporary: integer({ mode: "boolean" }).notNull().default(false),
  pinned: integer({ mode: "boolean" }).notNull().default(false),
  memoryEnabled: integer({ mode: "boolean" }).notNull().default(true),
  effort: text().$type<StoredBot["effort"]>().notNull().default("medium"),
  model: text(),
  inheritMemberPermissions: integer({ mode: "boolean" }).notNull().default(false),
  permissionMode: text().$type<StoredBot["permissionMode"]>().notNull().default("ask"),
  createdAt: text().notNull(),
}, (table) => [
  index("bots_leader_bot_id").on(table.leaderBotId),
  index("bots_project_id").on(table.projectId),
])

export const conversations = snakeCase.table("conversations", {
  botId: text().primaryKey().references(() => bots.id, { onDelete: "cascade" }),
  sessionFile: text(),
})

export const tasks = snakeCase.table("tasks", {
  id: text().primaryKey(),
  callerBotId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
  assigneeBotId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
  status: text().$type<Task["status"]>().notNull(),
  createdAt: text().notNull(),
  finishedAt: text(),
}, (table) => [
  index("tasks_caller_bot_id").on(table.callerBotId),
  index("tasks_assignee_bot_id").on(table.assigneeBotId),
])

export const colleagues = snakeCase.table("colleagues", {
  botId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
  colleagueBotId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.botId, table.colleagueBotId] }),
  index("colleagues_colleague_bot_id").on(table.colleagueBotId),
])

export const messages = snakeCase.table("messages", {
  id: text().primaryKey(),
  botId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
  position: integer().notNull(),
  author: text().$type<ConversationMessage["author"]>().notNull(),
  authorBotId: text().references(() => bots.id, { onDelete: "set null" }),
  taskId: text().references(() => tasks.id, { onDelete: "set null" }),
  triggerRunId: text(),
  content: text().notNull(),
  images: text({ mode: "json" }).$type<ConversationMessage["images"]>().notNull().default(sql`'[]'`),
  question: text({ mode: "json" }).$type<ConversationMessage["question"]>(),
  replyTo: text({ mode: "json" }).$type<ConversationMessage["replyTo"]>(),
  activity: text({ mode: "json" }).$type<ConversationMessage["activity"]>(),
  ending: text().$type<ConversationMessage["ending"]>(),
  error: text(),
  createdAt: text().notNull(),
}, (table) => [
  index("messages_bot_position").on(table.botId, table.position),
  index("messages_task_id").on(table.taskId),
  index("messages_trigger_run_id").on(table.triggerRunId),
])

export const routines = snakeCase.table("routines", {
  id: text().primaryKey(),
  botId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
  name: text().notNull(),
  content: text().notNull(),
  frequency: text({ mode: "json" }).$type<Routine["frequency"]>().notNull(),
  status: text().$type<Routine["status"]>().notNull().default("active"),
  timeZone: text().notNull(),
  nextCallAt: text(),
  favorite: integer({ mode: "boolean" }).notNull().default(false),
  createdAt: text().notNull(),
}, (table) => [index("routines_bot_id").on(table.botId)])

export const memoryProgress = snakeCase.table("memory_progress", {
  botId: text().primaryKey().references(() => bots.id, { onDelete: "cascade" }),
  curatedThroughPosition: integer().notNull().default(0),
})

export const memories = snakeCase.table("memories", {
  id: text().primaryKey(),
  botId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
  content: text().notNull(),
  origin: text().$type<StoredMemory["origin"]>().notNull(),
  sourceMessageId: text().references(() => messages.id, { onDelete: "set null" }),
  supersededAt: text(),
  supersededByMessageId: text().references(() => messages.id, { onDelete: "set null" }),
  curationVersion: integer().notNull().default(0),
  createdAt: text().notNull(),
}, (table) => [index("memories_bot_id").on(table.botId)])

export const memorySettings = snakeCase.table("memory_settings", {
  id: integer().primaryKey(),
  model: text({ mode: "json" }).$type<CurationModel>(),
})

export const curationFailures = snakeCase.table("curation_failures", {
  botId: text().primaryKey().references(() => bots.id, { onDelete: "cascade" }),
  error: text().notNull(),
})

export const plugins = snakeCase.table("plugins", {
  id: text().primaryKey(),
  name: text().notNull(),
  config: text({ mode: "json" }).$type<StoredPlugin["config"]>().notNull(),
  createdAt: text().notNull(),
})

export const accounts = snakeCase.table("accounts", {
  id: text().primaryKey(),
  pluginId: text().notNull(),
  label: text().notNull(),
  state: text().$type<StoredAccount["state"]>().notNull(),
  secret: text(),
  tools: text({ mode: "json" }).$type<StoredAccount["tools"]>().notNull().default(sql`'[]'`),
  checkedAt: text().notNull(),
}, (table) => [index("accounts_plugin_id").on(table.pluginId)])

export const accesses = snakeCase.table("accesses", {
  botId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
  accountId: text().notNull().references(() => accounts.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.botId, table.accountId] }),
  index("accesses_account_id").on(table.accountId),
])

export const triggers = snakeCase.table("triggers", {
  id: text().primaryKey(),
  botId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
  accountId: text().notNull().references(() => accounts.id, { onDelete: "cascade" }),
  source: text().$type<Trigger["source"]>().notNull(),
  name: text().notNull(),
  event: text().$type<Trigger["event"]>().notNull(),
  actions: text({ mode: "json" }).$type<Trigger["actions"]>().notNull(),
  repositories: text({ mode: "json" }).$type<Trigger["repositories"]>().notNull(),
  labels: text({ mode: "json" }).$type<Trigger["labels"]>().notNull(),
  instruction: text().notNull(),
  includeOwnEvents: integer({ mode: "boolean" }).notNull().default(false),
  status: text().$type<Trigger["status"]>().notNull().default("active"),
  createdAt: text().notNull(),
}, (table) => [
  index("triggers_bot_id").on(table.botId),
  index("triggers_account_id").on(table.accountId),
])

export const triggerRuns = snakeCase.table("trigger_runs", {
  id: text().primaryKey(),
  triggerId: text().notNull().references(() => triggers.id, { onDelete: "cascade" }),
  botId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
  deliveryId: text().notNull(),
  event: text({ mode: "json" }).$type<TriggerRun["event"]>().notNull(),
  status: text().$type<TriggerRun["status"]>().notNull(),
  error: text(),
  createdAt: text().notNull(),
  startedAt: text(),
  finishedAt: text(),
}, (table) => [
  uniqueIndex("trigger_runs_trigger_delivery").on(table.triggerId, table.deliveryId),
  index("trigger_runs_bot_status").on(table.botId, table.status, table.createdAt),
])

export const whatsappContacts = snakeCase.table("whatsapp_contacts", {
  accountId: text().notNull().references(() => accounts.id, { onDelete: "cascade" }),
  jid: text().notNull(),
  name: text().notNull(),
}, (table) => [primaryKey({ columns: [table.accountId, table.jid] })])

export const whatsappMessages = snakeCase.table("whatsapp_messages", {
  id: text().primaryKey(),
  accountId: text().notNull().references(() => accounts.id, { onDelete: "cascade" }),
  chatId: text().notNull(),
  senderName: text().notNull(),
  fromMe: integer({ mode: "boolean" }).notNull(),
  content: text().notNull(),
  sentAt: text().notNull(),
}, (table) => [
  index("whatsapp_messages_account_chat").on(table.accountId, table.chatId, table.sentAt),
  index("whatsapp_messages_account_sent_at").on(table.accountId, table.sentAt),
])
