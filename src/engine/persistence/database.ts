import { Database } from "bun:sqlite"
import { and, asc, count, desc, eq, getTableColumns, isNotNull, isNull, lt, max, ne, notExists, or, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import type { SQLiteTable } from "drizzle-orm/sqlite-core"
import { alias } from "drizzle-orm/sqlite-core"
import type { Colleague, StoredBot } from "@src/shared/bots"
import { botSchemas } from "@src/shared/bots"
import type { Project } from "@src/shared/projects"
import { projectSchemas } from "@src/shared/projects"
import type { Observability } from "../observability/observability"
import { migrations } from "./migrations"
import type { ConversationMessage } from "@src/shared/conversations"
import { conversationSchemas } from "@src/shared/conversations"
import type { CurationBatch, CurationModel, MemorySearch, StoredMemory } from "@src/shared/memory"
import { memorySchemas } from "@src/shared/memory"
import { memoryLimits } from "@src/shared/memory-limits"
import { historySchemas, historyLimits, type HistorySearch } from "@src/shared/history"
import type { PluginAccess, StoredAccount, StoredPlugin } from "@src/shared/plugins"
import { pluginSchemas } from "@src/shared/plugins"
import type { Routine } from "@src/shared/routines"
import { routineSchemas } from "@src/shared/routines"
import type { Task } from "@src/shared/tasks"
import { taskSchemas } from "@src/shared/tasks"
import type { WhatsappContact, WhatsappSavedMessage } from "@src/shared/whatsapp"
import { whatsappSchemas } from "@src/shared/whatsapp"
import type { Trigger, TriggerRun } from "@src/shared/triggers"
import { triggerSchemas } from "@src/shared/triggers"
import { accesses, accounts, bots, colleagues, conversations, curationFailures, memories, memorySettings, messages, memoryProgress, plugins, projects, routines, tasks, triggerRuns, triggers, whatsappContacts, whatsappMessages } from "./schema"
import { parse, parseOptional } from "@src/shared/parse"
import { jevSettings } from "./schema"

const chatName = sql<string>`coalesce(${whatsappContacts.name}, ${whatsappMessages.chatId})`

function insertion(table: SQLiteTable) {
  return sql`${table}.rowid`
}

const { position, ...messageColumns } = getTableColumns(messages)
const { curationVersion: _curationVersion, ...memoryColumns } = getTableColumns(memories)
const memorySource = alias(messages, "memory_source")
const supersedingMessage = alias(messages, "superseding_message")

const historyColumns = {
  id: messages.id,
  author: messages.author,
  authorBotId: messages.authorBotId,
  taskId: messages.taskId,
  createdAt: messages.createdAt,
  content: messages.content,
}

export function openDatabase(path: string, observability: Observability) {
  const sqlite = new Database(path, { create: true })
  const database = drizzle({ client: sqlite })

  sqlite.run("PRAGMA foreign_keys = OFF")
  observability.span({ name: "database.migrate" }, () => {
    migrate(database, migrations)
  })
  sqlite.run("PRAGMA foreign_keys = ON")

  function cursor(botId: string) {
    return database.select().from(memoryProgress).where(eq(memoryProgress.botId, botId)).get()?.curatedThroughPosition ?? 0
  }

  function pendingBotIds() {
    return database.selectDistinct({ botId: messages.botId }).from(messages).innerJoin(bots, eq(bots.id, messages.botId)).leftJoin(memoryProgress, eq(memoryProgress.botId, messages.botId)).where(and(eq(bots.memoryEnabled, true), eq(bots.temporary, false), eq(messages.author, "person"), sql`${messages.position} > coalesce(${memoryProgress.curatedThroughPosition}, 0)`)).all().map((row) => row.botId)
  }

  function source(id: string | null) {
    if (!id) {
      return null
    }

    const row = database.select({ id: messages.id, content: messages.content, author: messages.author, createdAt: messages.createdAt }).from(messages).where(eq(messages.id, id)).get()

    if (!row) {
      return null
    }

    return parse(memorySchemas.source, row)
  }

  return {
    jev: {
      get() {
        return database.select({ key: jevSettings.key, verification: jevSettings.verification }).from(jevSettings).where(eq(jevSettings.id, 1)).get()
      },
      save(value: Pick<typeof jevSettings.$inferInsert, "key" | "verification">) {
        database.insert(jevSettings).values({ id: 1, ...value }).onConflictDoUpdate({ target: jevSettings.id, set: value }).run()
      },
      remove() {
        database.delete(jevSettings).where(eq(jevSettings.id, 1)).run()
      },
    },
    history: {
      search(botId: string, input: HistorySearch) {
        const terms = input.query.match(/[\p{L}\p{N}]+/gu)

        if (!terms?.length) {
          return { matches: [], nextOffset: null }
        }

        const query = terms.map((term) => `"${term}"*`).join(" AND ")
        const rows = observability.span({ name: "database.historysearch", context: { botId } }, () => parse(historySchemas.references, database.all(sql`
          SELECT m.id, m.author, m.author_bot_id AS authorBotId, m.task_id AS taskId,
            m.created_at AS createdAt, snippet(message_search, 0, '', '', ' … ', 48) AS content
          FROM message_search JOIN messages m ON m.rowid = message_search.rowid
          WHERE message_search MATCH ${query} AND m.bot_id = ${botId}
            AND (${input.after ?? null} IS NULL OR substr(m.created_at, 1, 10) >= ${input.after ?? null})
            AND (${input.before ?? null} IS NULL OR substr(m.created_at, 1, 10) <= ${input.before ?? null})
          ORDER BY rank, m.position DESC LIMIT ${historyLimits.results + 1} OFFSET ${input.offset}
        `)))

        return {
          matches: rows.slice(0, historyLimits.results).map((row) => ({ ...row, content: row.content.slice(0, historyLimits.excerpt) })),
          nextOffset: rows.length > historyLimits.results ? input.offset + historyLimits.results : null,
        }
      },
      read(botId: string, id: string, offset: number) {
        return observability.span({ name: "database.historyread", context: { botId } }, () => {
          const row = database.select({ message: { ...historyColumns, content: sql<string>`substr(${messages.content}, ${offset + 1}, ${historyLimits.content})` }, position: messages.position, length: sql<number>`length(${messages.content})` }).from(messages).where(and(eq(messages.botId, botId), eq(messages.id, id))).get()

          if (!row) {
            throw new Error("Message not found in your conversation")
          }

          const neighbors = parse(historySchemas.references, database.select({ ...historyColumns, content: sql<string>`substr(${messages.content}, 1, ${historyLimits.excerpt})` }).from(messages).where(and(
            eq(messages.botId, botId),
            sql`${messages.position} BETWEEN ${row.position - historyLimits.neighbors} AND ${row.position + historyLimits.neighbors}`,
            sql`${messages.id} != ${id}`,
          )).orderBy(asc(messages.position)).all())

          return { message: parse(historySchemas.reference, row.message), offset, nextOffset: offset + historyLimits.content < row.length ? offset + historyLimits.content : null, neighbors }
        })
      },
    },
    curation: {
      model() {
        return parse(memorySchemas.curationModel, database.select().from(memorySettings).where(eq(memorySettings.id, 1)).get()?.model ?? null)
      },
      configure(model: CurationModel) {
        database.insert(memorySettings).values({ id: 1, model }).onConflictDoUpdate({ target: memorySettings.id, set: { model } }).run()
      },
      failure(botId: string, error: string) {
        database.insert(curationFailures).values({ botId, error }).onConflictDoUpdate({ target: curationFailures.botId, set: { error } }).run()
      },
      recovered(botId: string) {
        database.delete(curationFailures).where(eq(curationFailures.botId, botId)).run()
      },
      status() {
        return parse(memorySchemas.status, {
          pending: pendingBotIds().length,
          failures: database.select({ botId: bots.id, name: bots.name, error: curationFailures.error }).from(curationFailures).innerJoin(bots, eq(bots.id, curationFailures.botId)).orderBy(asc(bots.name)).all(),
        })
      },
      pendingBotIds,
      batch(botId: string) {
        const after = cursor(botId)
        const rows = database.select({ id: messages.id, content: sql<string>`CASE WHEN ${messages.author} = 'person' THEN ${messages.content} ELSE substr(${messages.content}, 1, ${memoryLimits.message}) END`, author: messages.author, createdAt: messages.createdAt, question: messages.question, replyTo: messages.replyTo, position: messages.position }).from(messages).where(and(eq(messages.botId, botId), sql`${messages.position} > ${after}`)).orderBy(asc(messages.position)).limit(memoryLimits.batch).all()
        const first = rows.at(0)
        const previous = first ? database.select({ id: messages.id, content: sql<string>`substr(${messages.content}, 1, ${memoryLimits.message})`, author: messages.author, createdAt: messages.createdAt, question: messages.question, replyTo: messages.replyTo }).from(messages).where(and(eq(messages.botId, botId), lt(messages.position, first.position))).orderBy(desc(messages.position)).get() : null

        return parse(memorySchemas.batch, { after, through: rows.at(-1)?.position ?? after, messages: rows, context: previous ?? null })
      },
      skip(botId: string) {
        const through = database.select({ value: max(messages.position) }).from(messages).where(eq(messages.botId, botId)).get()?.value ?? 0
        database.insert(memoryProgress).values({ botId, curatedThroughPosition: through }).onConflictDoUpdate({ target: memoryProgress.botId, set: { curatedThroughPosition: through } }).run()
        database.delete(curationFailures).where(eq(curationFailures.botId, botId)).run()
      },
      commit(botId: string, original: StoredMemory[], updated: StoredMemory[], batch: CurationBatch) {
        return database.transaction((transaction) => {
          const bot = transaction.select().from(bots).where(eq(bots.id, botId)).get()
          const current = transaction.select().from(memories).where(eq(memories.botId, botId)).orderBy(asc(memories.createdAt), asc(insertion(memories))).all()

          if (!bot?.memoryEnabled || JSON.stringify(current) !== JSON.stringify(original) || cursor(botId) !== batch.after) {
            throw new Error("A Memória mudou durante a Curadoria. As mensagens serão avaliadas novamente.")
          }

          const removed = original.filter((memory) => !updated.some((entry) => entry.id === memory.id))

          for (const memory of removed) {
            transaction.delete(memories).where(eq(memories.id, memory.id)).run()
          }

          for (const memory of updated.filter((memory) => JSON.stringify(memory) !== JSON.stringify(original.find((entry) => entry.id === memory.id)))) {
            transaction.insert(memories).values(memory).onConflictDoUpdate({ target: memories.id, set: memory }).run()
          }

          transaction.insert(memoryProgress).values({ botId, curatedThroughPosition: batch.through }).onConflictDoUpdate({ target: memoryProgress.botId, set: { curatedThroughPosition: batch.through } }).run()
          transaction.delete(curationFailures).where(eq(curationFailures.botId, botId)).run()
        })
      },
    },

    projects: {
      create(project: Project) {
        return observability.span({ name: "database.projectcreate", context: { projectId: project.id } }, () => {
          database.insert(projects).values(project).run()

          return project
        })
      },
      list() {
        return observability.span(
          { name: "database.projectlist" },
          () => parse(projectSchemas.projectList, database.select().from(projects).orderBy(asc(projects.createdAt), asc(insertion(projects))).all()),
        )
      },
      get(id: string) {
        return observability.span({ name: "database.projectget", context: { projectId: id } }, () => {
          const row = database.select().from(projects).where(eq(projects.id, id)).get()

          return parseOptional(projectSchemas.project, row)
        })
      },
      update(id: string, changes: Pick<Project, "name" | "defaultWorkingDirectory">) {
        return observability.span({ name: "database.projectupdate", context: { projectId: id } }, () => {
          const row = database.update(projects).set(changes).where(eq(projects.id, id)).returning().get()

          return parseOptional(projectSchemas.project, row)
        })
      },
      remove(id: string) {
        return observability.span({ name: "database.projectremove", context: { projectId: id } }, () => database.delete(projects).where(eq(projects.id, id)).run().changes)
      },
    },
    bots: {
      detachMember(id: string) {
        const row = database.update(bots).set({ leaderBotId: null }).where(eq(bots.id, id)).returning().get()

        return parseOptional(botSchemas.storedBot, row)
      },
      addMember(bot: Pick<StoredBot, "id" | "leaderBotId" | "projectId" | "workingDirectoryOverride">) {
        return observability.span({ name: "database.botmemberadd", context: { botId: bot.id } }, () => database.transaction((transaction) => {
          const updated = transaction.update(bots).set({ leaderBotId: bot.leaderBotId, projectId: bot.projectId, workingDirectoryOverride: bot.workingDirectoryOverride }).where(eq(bots.id, bot.id)).returning().get()

          if (!updated) {
            return
          }

          transaction.delete(colleagues).where(eq(colleagues.colleagueBotId, bot.id)).run()

          return parse(botSchemas.storedBot, updated)
        }))
      },
      create(bot: StoredBot) {
        return observability.span({ name: "database.botcreate", context: { botId: bot.id, provider: bot.provider, ...(bot.projectId ? { projectId: bot.projectId } : {}) } }, () => {
          database.insert(bots).values(bot).run()
          return bot
        })
      },
      list() {
        return observability.span({ name: "database.botlist" }, () => parse(botSchemas.storedBotList, database.select().from(bots).orderBy(asc(bots.createdAt), asc(insertion(bots))).all()))
      },
      get(id: string) {
        return observability.span({ name: "database.botget", context: { botId: id } }, () => {
          const row = database.select().from(bots).where(eq(bots.id, id)).get()
          return parseOptional(botSchemas.storedBot, row)
        })
      },
      update(id: string, changes: Pick<StoredBot, "name" | "function" | "projectId" | "workingDirectoryOverride" | "memoryEnabled" | "effort" | "model" | "permissionMode"> & Partial<Pick<StoredBot, "inheritMemberPermissions">>) {
        return observability.span({ name: "database.botupdate", context: { botId: id, ...(changes.projectId ? { projectId: changes.projectId } : {}) } }, () => {
          const row = database.transaction((transaction) => {
            const previous = transaction.select().from(bots).where(eq(bots.id, id)).get()

            if (previous && !previous.temporary && previous.memoryEnabled !== changes.memoryEnabled) {
              const through = transaction.select({ value: max(messages.position) }).from(messages).where(eq(messages.botId, id)).get()?.value ?? 0
              transaction.insert(memoryProgress).values({ botId: id, curatedThroughPosition: through }).onConflictDoUpdate({ target: memoryProgress.botId, set: { curatedThroughPosition: through } }).run()
              transaction.delete(curationFailures).where(eq(curationFailures.botId, id)).run()
            }

            const updated = transaction.update(bots).set(changes).where(eq(bots.id, id)).returning().get()

            if (!updated) {
              return
            }

            transaction.update(bots).set({ projectId: changes.projectId }).where(eq(bots.leaderBotId, id)).run()

            return updated
          })

          return parseOptional(botSchemas.storedBot, row)
        })
      },
      updateExecution(id: string, changes: Partial<Pick<StoredBot, "effort" | "provider" | "model" | "permissionMode" | "workingDirectoryOverride">>) {
        return observability.span({ name: "database.botexecutionupdate", context: { botId: id } }, () => {
          const row = database.update(bots).set(changes).where(eq(bots.id, id)).returning().get()

          return parseOptional(botSchemas.storedBot, row)
        })
      },
      updateProject(id: string, projectId: string | null) {
        return observability.span({ name: "database.botprojectupdate", context: { botId: id, ...(projectId ? { projectId } : {}) } }, () => {
          const row = database.transaction((transaction) => {
            const updated = transaction.update(bots).set({ projectId, leaderBotId: null }).where(eq(bots.id, id)).returning().get()

            if (!updated) {
              return
            }

            transaction.update(bots).set({ projectId }).where(eq(bots.leaderBotId, id)).run()

            return updated
          })

          return parseOptional(botSchemas.storedBot, row)
        })
      },
      updatePinned(id: string, pinned: boolean) {
        return observability.span({ name: "database.botpinupdate", context: { botId: id } }, () => {
          const row = database.update(bots).set({ pinned }).where(eq(bots.id, id)).returning().get()

          return parseOptional(botSchemas.storedBot, row)
        })
      },
      remove(id: string) {
        return observability.span({ name: "database.botremove", context: { botId: id } }, () => database.delete(bots).where(eq(bots.id, id)).run().changes)
      },
    },
    conversations: {
      overview() {
        const lastPositions = database.select({ botId: messages.botId, position: max(messages.position).as("position") }).from(messages).where(and(
          ne(messages.author, "routine"),
          ne(messages.author, "trigger"),
          or(ne(messages.content, ""), ne(messages.images, []), isNotNull(messages.ending)),
        )).groupBy(messages.botId).as("last")
        const rows = database.select({
          botId: messages.botId,
          id: messages.id,
          createdAt: messages.createdAt,
          author: messages.author,
          authorBotId: messages.authorBotId,
          ending: messages.ending,
          preview: sql<string>`substr(${messages.content}, 1, 240)`,
          awaitingResponse: sql<boolean>`${messages.question} is not null and ${messages.question} != 'null'`.mapWith(Boolean),
        }).from(messages).innerJoin(lastPositions, and(eq(messages.botId, lastPositions.botId), eq(messages.position, lastPositions.position))).all()

        return parse(conversationSchemas.overview, rows)
      },
      get(messageId: string) {
        return observability.span({ name: "database.conversationmessageget" }, () => {
          const row = database.select(messageColumns).from(messages).where(eq(messages.id, messageId)).get()

          return parseOptional(conversationSchemas.message, row)
        })
      },
      history(botId: string, page: { before?: string; limit: number }) {
        return observability.span({ name: "database.conversationhistory", context: { botId } }, () => {
          const cursor = page.before ? database.select({ position: messages.position }).from(messages).where(and(eq(messages.botId, botId), eq(messages.id, page.before))).get() : undefined

          if (page.before && !cursor) {
            throw new Error("Message not found")
          }

          const older = cursor ? and(eq(messages.botId, botId), lt(messages.position, cursor.position)) : eq(messages.botId, botId)
          const rows = database.select({ ...messageColumns, position }).from(messages).where(older).orderBy(desc(messages.position)).limit(page.limit).all().toReversed()
          const oldest = rows.at(0)
          const earlier = oldest ? database.select({ value: count() }).from(messages).where(and(eq(messages.botId, botId), lt(messages.position, oldest.position))).get()?.value ?? 0 : 0

          return parse(conversationSchemas.history, { messages: rows.map(({ position: _position, ...row }) => row), earlier })
        })
      },
      replied(questionId: string) {
        return observability.span({ name: "database.conversationreplied" }, () => !!database.select({ id: messages.id }).from(messages).where(sql`json_extract(${messages.replyTo}, '$.messageId') = ${questionId}`).get())
      },
      related(taskId: string) {
        return observability.span({ name: "database.conversationrelated", context: { taskId } }, () => parse(conversationSchemas.messageList, 
          database.select(messageColumns).from(messages).where(eq(messages.taskId, taskId)).orderBy(asc(insertion(messages))).all(),
        ))
      },
      lastMessages() {
        return observability.span({ name: "database.conversationlast" }, () => {
          const lastPositions = database.select({ botId: messages.botId, position: max(messages.position).as("position") }).from(messages).groupBy(messages.botId).as("last")

          return parse(conversationSchemas.messageList, 
            database.select(messageColumns).from(messages).innerJoin(lastPositions, and(eq(messages.botId, lastPositions.botId), eq(messages.position, lastPositions.position))).all(),
          )
        })
      },
      append(message: ConversationMessage) {
        return observability.span({ name: "database.messageappend", context: { botId: message.botId } }, () => {
          const lastPosition = database.select({ value: max(messages.position) }).from(messages).where(eq(messages.botId, message.botId)).get()?.value ?? 0
          database.insert(messages).values({ ...message, position: lastPosition + 1 }).run()

          return message
        })
      },
      sessionFile(botId: string) {
        return observability.span({ name: "database.conversationsessionget", context: { botId } }, () => database.select({ sessionFile: conversations.sessionFile }).from(conversations).where(eq(conversations.botId, botId)).get()?.sessionFile ?? undefined)
      },
      saveSessionFile(botId: string, sessionFile: string | null) {
        return observability.span({ name: "database.conversationsessionsave", context: { botId } }, () => {
          database.insert(conversations).values({ botId, sessionFile }).onConflictDoUpdate({ target: conversations.botId, set: { sessionFile } }).run()
        })
      },
    },
    tasks: {
      create(task: Task) {
        return observability.span({ name: "database.taskcreate", context: { taskId: task.id, callerBotId: task.callerBotId, botId: task.assigneeBotId } }, () => {
          database.insert(tasks).values(task).run()

          return task
        })
      },
      get(id: string) {
        return observability.span({ name: "database.taskget", context: { taskId: id } }, () => {
          const row = database.select().from(tasks).where(eq(tasks.id, id)).get()

          return parseOptional(taskSchemas.task, row)
        })
      },
      update(id: string, changes: Partial<Pick<Task, "assigneeBotId" | "status" | "finishedAt">>) {
        return observability.span({ name: "database.taskupdate", context: { taskId: id } }, () => {
          const row = database.update(tasks).set(changes).where(eq(tasks.id, id)).returning().get()

          return parseOptional(taskSchemas.task, row)
        })
      },
      interruptWorking(finishedAt: string) {
        return observability.span({ name: "database.taskinterruptworking" }, () => {
          return database.update(tasks).set({ status: "interrupted", finishedAt }).where(eq(tasks.status, "working")).run().changes
        })
      },
      workingAssigneeIds() {
        return observability.span({ name: "database.taskworkingassignees" }, () => new Set(
          database.selectDistinct({ assigneeBotId: tasks.assigneeBotId }).from(tasks).where(eq(tasks.status, "working")).all().map((row) => row.assigneeBotId),
        ))
      },
      listForBot(botId: string) {
        return observability.span({ name: "database.tasklist", context: { botId } }, () => parse(taskSchemas.taskList,
          database.select().from(tasks).where(or(eq(tasks.callerBotId, botId), eq(tasks.assigneeBotId, botId))).orderBy(asc(tasks.createdAt), asc(insertion(tasks))).all(),
        ))
      },
    },
    colleagues: {
      list() {
        return observability.span({ name: "database.colleaguelist" }, () => parse(botSchemas.colleagueList, database.select().from(colleagues).orderBy(asc(insertion(colleagues))).all()))
      },
      listForBot(botId: string) {
        return observability.span({ name: "database.colleaguelistforbot", context: { botId } }, () => parse(botSchemas.colleagueList, database.select().from(colleagues).where(eq(colleagues.botId, botId)).orderBy(asc(insertion(colleagues))).all()))
      },
      set(colleague: Colleague) {
        return observability.span({ name: "database.colleagueset", context: { botId: colleague.botId } }, () => {
          database.insert(colleagues).values(colleague).onConflictDoNothing().run()

          return colleague
        })
      },
      remove(botId: string, colleagueBotId: string) {
        return observability.span({ name: "database.colleagueremove", context: { botId } }, () => database.delete(colleagues).where(and(eq(colleagues.botId, botId), eq(colleagues.colleagueBotId, colleagueBotId))).run().changes)
      },
    },
    routines: {
      create(routine: Routine) {
        return observability.span({ name: "database.routinecreate", context: { botId: routine.botId } }, () => {
          database.insert(routines).values(routine).run()

          return routine
        })
      },
      get(id: string) {
        return observability.span({ name: "database.routineget" }, () => {
          const row = database.select().from(routines).where(eq(routines.id, id)).get()

          return parseOptional(routineSchemas.routine, row)
        })
      },
      listForBot(botId: string) {
        return observability.span({ name: "database.routinelist", context: { botId } }, () => parse(routineSchemas.routineList, 
          database.select().from(routines).where(eq(routines.botId, botId)).orderBy(asc(routines.createdAt), asc(insertion(routines))).all(),
        ))
      },
      listActive() {
        return observability.span({ name: "database.routinelistenabled" }, () => parse(routineSchemas.routineList, 
          database.select().from(routines).where(eq(routines.status, "active")).orderBy(asc(routines.nextCallAt), asc(insertion(routines))).all(),
        ))
      },
      update(id: string, changes: Partial<Pick<Routine, "name" | "content" | "frequency" | "status" | "timeZone" | "nextCallAt" | "favorite">>) {
        return observability.span({ name: "database.routineupdate" }, () => {
          const row = database.update(routines).set(changes).where(eq(routines.id, id)).returning().get()

          return parseOptional(routineSchemas.routine, row)
        })
      },
      remove(id: string) {
        return observability.span({ name: "database.routineremove" }, () => database.delete(routines).where(eq(routines.id, id)).run().changes)
      },
    },
    triggers: {
      create(trigger: Trigger) {
        return observability.span({ name: "database.triggercreate", context: { botId: trigger.botId } }, () => {
          database.insert(triggers).values(trigger).run()

          return trigger
        })
      },
      get(id: string) {
        return observability.span({ name: "database.triggerget" }, () => parseOptional(triggerSchemas.trigger, database.select().from(triggers).where(eq(triggers.id, id)).get()))
      },
      listForBot(botId: string) {
        return observability.span({ name: "database.triggerlist", context: { botId } }, () => parse(triggerSchemas.triggerList, database.select().from(triggers).where(eq(triggers.botId, botId)).orderBy(asc(triggers.createdAt), asc(insertion(triggers))).all()))
      },
      listActive() {
        return observability.span({ name: "database.triggerlistactive" }, () => parse(triggerSchemas.triggerList, database.select().from(triggers).where(eq(triggers.status, "active")).orderBy(asc(triggers.createdAt), asc(insertion(triggers))).all()))
      },
      update(id: string, changes: Pick<Trigger, "name" | "event" | "actions" | "repositories" | "labels" | "instruction" | "includeOwnEvents" | "status">) {
        return observability.span({ name: "database.triggerupdate" }, () => parseOptional(triggerSchemas.trigger, database.update(triggers).set(changes).where(eq(triggers.id, id)).returning().get()))
      },
      remove(id: string) {
        return observability.span({ name: "database.triggerremove" }, () => database.delete(triggers).where(eq(triggers.id, id)).run().changes)
      },
    },
    triggerRuns: {
      create(run: TriggerRun) {
        return observability.span({ name: "database.triggerruncreate", context: { botId: run.botId } }, () => {
          const created = database.insert(triggerRuns).values(run).onConflictDoNothing().returning().get()

          return parseOptional(triggerSchemas.triggerRun, created)
        })
      },
      queuedBotIds() {
        return observability.span({ name: "database.triggerrunbots" }, () => database.selectDistinct({ botId: triggerRuns.botId }).from(triggerRuns).where(eq(triggerRuns.status, "queued")).all().map((run) => run.botId))
      },
      nextQueued(botId: string) {
        return observability.span({ name: "database.triggerrunqueued", context: { botId } }, () => parseOptional(triggerSchemas.triggerRun, database.select().from(triggerRuns).where(and(eq(triggerRuns.status, "queued"), eq(triggerRuns.botId, botId))).orderBy(asc(triggerRuns.createdAt), asc(insertion(triggerRuns))).limit(1).get()))
      },
      update(id: string, changes: Partial<Pick<TriggerRun, "status" | "error" | "startedAt" | "finishedAt">>) {
        return observability.span({ name: "database.triggerrunupdate" }, () => parseOptional(triggerSchemas.triggerRun, database.update(triggerRuns).set(changes).where(eq(triggerRuns.id, id)).returning().get()))
      },
      recoverRunning(finishedAt: string) {
        return observability.span({ name: "database.triggerrunrecover" }, () => database.transaction((transaction) => {
          const turnStarted = transaction.select({ value: sql`1` }).from(messages).where(eq(messages.triggerRunId, triggerRuns.id))
          const requeued = transaction.update(triggerRuns).set({ status: "queued", startedAt: null }).where(and(eq(triggerRuns.status, "running"), notExists(turnStarted))).run().changes
          const interrupted = transaction.update(triggerRuns).set({ status: "failed", error: "Mimo stopped during this Disparo", finishedAt }).where(eq(triggerRuns.status, "running")).run().changes

          return { requeued, interrupted }
        }))
      },
    },
    memories: {
      activeForBot(botId: string) {
        return parse(memorySchemas.storedMemory.array(), database.select().from(memories).where(and(eq(memories.botId, botId), isNull(memories.supersededAt))).orderBy(asc(memories.createdAt), asc(insertion(memories))).all())
      },
      hasOutdated(botId: string, curationVersion: number) {
        return !!database.select({ value: count() }).from(memories).where(and(eq(memories.botId, botId), eq(memories.origin, "bot"), isNull(memories.supersededAt), lt(memories.curationVersion, curationVersion))).get()?.value
      },
      outdatedBotIds(curationVersion: number) {
        return database.selectDistinct({ botId: memories.botId }).from(memories).where(and(eq(memories.origin, "bot"), isNull(memories.supersededAt), lt(memories.curationVersion, curationVersion))).all().map((row) => row.botId)
      },
      snapshot(botId: string) {
        return parse(memorySchemas.storedMemory.array(), database.select().from(memories).where(eq(memories.botId, botId)).orderBy(asc(memories.createdAt), asc(insertion(memories))).all())
      },
      create(memory: StoredMemory) {
        return observability.span({ name: "database.memorycreate", context: { botId: memory.botId } }, () => {
          database.insert(memories).values(memory).run()

          return memory
        })
      },
      get(id: string) {
        return observability.span({ name: "database.memoryget" }, () => {
          const row = database.select().from(memories).where(eq(memories.id, id)).get()

          return parseOptional(memorySchemas.storedMemory, row)
        })
      },
      listForBot(botId: string) {
        return observability.span({ name: "database.memorylist", context: { botId } }, () => {
          const rows = database.select({
            ...memoryColumns,
            source: { id: memorySource.id, content: memorySource.content, author: memorySource.author, createdAt: memorySource.createdAt },
            supersededBy: { id: supersedingMessage.id, content: supersedingMessage.content, author: supersedingMessage.author, createdAt: supersedingMessage.createdAt },
          }).from(memories).leftJoin(memorySource, eq(memorySource.id, memories.sourceMessageId)).leftJoin(supersedingMessage, eq(supersedingMessage.id, memories.supersededByMessageId)).where(eq(memories.botId, botId)).orderBy(asc(memories.createdAt), asc(insertion(memories))).all()

          return parse(memorySchemas.memoryList, rows)
        })
      },
      search(botId: string, input: MemorySearch) {
        const terms = input.query.match(/[\p{L}\p{N}]+/gu)

        if (!terms?.length) {
          return { matches: [], nextOffset: null }
        }

        const query = terms.map((term) => `"${term}"*`).join(" AND ")
        const rows = parse(memorySchemas.storedMemory.array(), database.all(sql`
          SELECT m.id, m.bot_id AS botId, m.content, m.origin, m.created_at AS createdAt,
            m.source_message_id AS sourceMessageId, m.superseded_at AS supersededAt,
            m.superseded_by_message_id AS supersededByMessageId, m.curation_version AS curationVersion
          FROM memory_search JOIN memories m ON m.rowid = memory_search.rowid
          WHERE memory_search MATCH ${query} AND m.bot_id = ${botId}
            AND (${input.after ?? null} IS NULL OR substr(m.created_at, 1, 10) >= ${input.after ?? null})
            AND (${input.before ?? null} IS NULL OR substr(m.created_at, 1, 10) <= ${input.before ?? null})
          ORDER BY rank, m.created_at DESC LIMIT ${memoryLimits.results + 1} OFFSET ${input.offset}
        `))

        return {
          matches: rows.slice(0, memoryLimits.results).map(({ curationVersion: _curationVersion, ...memory }) => ({ ...memory, status: memory.supersededAt ? "superseded" : "active", source: source(memory.sourceMessageId), supersededBy: source(memory.supersededByMessageId) })),
          nextOffset: rows.length > memoryLimits.results ? input.offset + memoryLimits.results : null,
        }
      },
      update(id: string, changes: Pick<StoredMemory, "content" | "origin" | "sourceMessageId" | "curationVersion" | "createdAt">) {
        return observability.span({ name: "database.memoryupdate" }, () => {
          const row = database.update(memories).set(changes).where(eq(memories.id, id)).returning().get()

          return parseOptional(memorySchemas.storedMemory, row)
        })
      },
      remove(id: string) {
        return observability.span({ name: "database.memoryremove" }, () => database.delete(memories).where(eq(memories.id, id)).run().changes)
      },
      removeForBot(botId: string) {
        return observability.span({ name: "database.memoryremoveforbot", context: { botId } }, () => database.delete(memories).where(eq(memories.botId, botId)).run().changes)
      },
    },
    plugins: {
      create(plugin: StoredPlugin) {
        return observability.span({ name: "database.plugincreate", context: { pluginId: plugin.id } }, () => {
          database.insert(plugins).values(plugin).run()

          return plugin
        })
      },
      list() {
        return observability.span({ name: "database.pluginlist" }, () => parse(pluginSchemas.storedPluginList, database.select().from(plugins).orderBy(asc(plugins.createdAt), asc(insertion(plugins))).all()))
      },
      remove(id: string) {
        return observability.span({ name: "database.pluginremove", context: { pluginId: id } }, () => database.transaction((transaction) => {
          transaction.delete(accounts).where(eq(accounts.pluginId, id)).run()

          return transaction.delete(plugins).where(eq(plugins.id, id)).run().changes
        }))
      },
    },
    accounts: {
      create(account: StoredAccount) {
        return observability.span({ name: "database.accountcreate", context: { pluginId: account.pluginId } }, () => {
          database.insert(accounts).values(account).run()

          return account
        })
      },
      list() {
        return observability.span({ name: "database.accountlist" }, () => parse(pluginSchemas.storedAccountList, database.select().from(accounts).orderBy(asc(accounts.checkedAt), asc(insertion(accounts))).all()))
      },
      get(id: string) {
        return observability.span({ name: "database.accountget" }, () => {
          const row = database.select().from(accounts).where(eq(accounts.id, id)).get()

          return parseOptional(pluginSchemas.storedAccount, row)
        })
      },
      update(id: string, changes: Partial<Pick<StoredAccount, "label" | "state" | "secret" | "tools" | "checkedAt">>) {
        return observability.span({ name: "database.accountupdate" }, () => {
          const row = database.update(accounts).set(changes).where(eq(accounts.id, id)).returning().get()

          return parseOptional(pluginSchemas.storedAccount, row)
        })
      },
      remove(id: string) {
        return observability.span({ name: "database.accountremove" }, () => database.delete(accounts).where(eq(accounts.id, id)).run().changes)
      },
    },
    accesses: {
      list() {
        return observability.span({ name: "database.accesslist" }, () => parse(pluginSchemas.accessList, database.select().from(accesses).orderBy(asc(insertion(accesses))).all()))
      },
      listForBot(botId: string) {
        return observability.span({ name: "database.accesslistforbot", context: { botId } }, () => parse(pluginSchemas.accessList, database.select().from(accesses).where(eq(accesses.botId, botId)).orderBy(asc(insertion(accesses))).all()))
      },
      set(access: PluginAccess) {
        return observability.span({ name: "database.accessset", context: { botId: access.botId } }, () => {
          database.insert(accesses).values(access).onConflictDoNothing().run()

          return access
        })
      },
      remove(botId: string, accountId: string) {
        return observability.span({ name: "database.accessremove", context: { botId } }, () => database.delete(accesses).where(and(eq(accesses.botId, botId), eq(accesses.accountId, accountId))).run().changes)
      },
    },
    whatsappMessages: {
      save(message: WhatsappSavedMessage) {
        return observability.span({ name: "database.whatsappmessagesave" }, () => {
          database.insert(whatsappMessages).values(message).onConflictDoUpdate({ target: whatsappMessages.id, set: message }).run()

          return message
        })
      },
      saveMany(messages: WhatsappSavedMessage[]) {
        return observability.span({ name: "database.whatsappmessagesavebatch", attributes: { count: messages.length } }, () => database.transaction((transaction) => {
          for (const message of messages) {
            transaction.insert(whatsappMessages).values(message).onConflictDoUpdate({ target: whatsappMessages.id, set: message }).run()
          }
        }))
      },
      saveContact(contact: WhatsappContact) {
        return observability.span({ name: "database.whatsappcontactsave" }, () => {
          database.insert(whatsappContacts).values(contact).onConflictDoUpdate({ target: [whatsappContacts.accountId, whatsappContacts.jid], set: { name: contact.name } }).run()

          return contact
        })
      },
      unnamedChats(accountId: string) {
        return observability.span({ name: "database.whatsappunnamedchats" }, () => database
          .selectDistinct({ chatId: whatsappMessages.chatId })
          .from(whatsappMessages)
          .leftJoin(whatsappContacts, and(eq(whatsappContacts.accountId, whatsappMessages.accountId), eq(whatsappContacts.jid, whatsappMessages.chatId)))
          .where(and(eq(whatsappMessages.accountId, accountId), isNull(whatsappContacts.name)))
          .all()
          .map((row) => row.chatId))
      },
      listChats(accountId: string) {
        return observability.span({ name: "database.whatsappchatlist" }, () => parse(whatsappSchemas.chatList, database
          .select({ chatId: whatsappMessages.chatId, chatName: chatName, lastSentAt: max(whatsappMessages.sentAt), lastSenderName: whatsappMessages.senderName, lastContent: whatsappMessages.content, messages: count() })
          .from(whatsappMessages)
          .leftJoin(whatsappContacts, and(eq(whatsappContacts.accountId, whatsappMessages.accountId), eq(whatsappContacts.jid, whatsappMessages.chatId)))
          .where(eq(whatsappMessages.accountId, accountId))
          .groupBy(whatsappMessages.chatId)
          .orderBy(desc(max(whatsappMessages.sentAt)))
          .all()))
      },
      readChat(accountId: string, chatId: string, limit: number) {
        return observability.span({ name: "database.whatsappchatread" }, () => parse(whatsappSchemas.storedMessageList, database
          .select({ id: whatsappMessages.id, accountId: whatsappMessages.accountId, chatId: whatsappMessages.chatId, chatName: chatName, senderName: whatsappMessages.senderName, fromMe: whatsappMessages.fromMe, content: whatsappMessages.content, sentAt: whatsappMessages.sentAt })
          .from(whatsappMessages)
          .leftJoin(whatsappContacts, and(eq(whatsappContacts.accountId, whatsappMessages.accountId), eq(whatsappContacts.jid, whatsappMessages.chatId)))
          .where(and(eq(whatsappMessages.accountId, accountId), eq(whatsappMessages.chatId, chatId)))
          .orderBy(desc(whatsappMessages.sentAt), desc(insertion(whatsappMessages)))
          .limit(limit)
          .all()).reverse())
      },
    },
    migrationState: () => {
      return observability.span({ name: "database.migrationstate" }, () => database.all<{ name: string }>(sql`SELECT name FROM __drizzle_migrations ORDER BY id`).map((entry) => entry.name))
    },
    close() {
      sqlite.close()
    },
  }
}

export type AppDatabase = ReturnType<typeof openDatabase>
