import type { Bot } from "@src/shared/bots"
import { routineSchemas, type CreateRoutineInput, type Frequency, type Routine, type UpdateFavoriteInput, type UpdateRoutineInput } from "@src/shared/routines"
import { weekdays } from "@src/shared/weekdays"
import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import type { PiCustomTool } from "../pi/pi-agent-runtime"
import { parse } from "@src/shared/parse"

function statusFrom(enabled: string | undefined, current: Routine["status"] | undefined) {
  if (!enabled) {
    return current ?? "active"
  }

  if (enabled === "no") {
    return "paused"
  }

  return "active"
}

function favoriteFrom(favorite: string | undefined, current?: Pick<Routine, "favorite">) {
  if (!favorite) {
    return !!current?.favorite
  }

  return favorite !== "no"
}

const minute = 60_000
const longestWait = 60 * minute

function nextCall(frequency: Frequency, from: Date) {
  if (frequency.form === "once") {
    const at = new Date(frequency.at)

    if (at <= from) {
      throw new Error("That time has passed")
    }

    return at
  }

  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(from)
    day.setDate(from.getDate() + offset)
    const weekday = weekdays[(day.getDay() + 6) % 7]
    const chosenDay = weekday !== undefined && frequency.days.includes(weekday)

    if (!chosenDay) {
      continue
    }

    const times = frequency.form === "fixed-time"
      ? frequency.times
      : intervalTimes(frequency.startTime, frequency.endTime, frequency.everyMinutes)

    for (const time of times) {
      const [hours = 0, minutes = 0] = time.split(":").map(Number)
      const candidate = new Date(day)
      candidate.setHours(hours, minutes, 0, 0)

      if (candidate > from) {
        return candidate
      }
    }
  }

  throw new Error("The Frequência has no next call")
}

function intervalTimes(startTime: string, endTime: string, everyMinutes: number) {
  const toMinutes = (value: string) => {
    const [hours = 0, minutes = 0] = value.split(":").map(Number)

    return hours * 60 + minutes
  }
  const start = toMinutes(startTime)
  const end = toMinutes(endTime)

  if (end < start) {
    throw new Error("The end time must not be before the start time")
  }

  const times: string[] = []

  for (let value = start; value <= end; value += everyMinutes) {
    times.push(`${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`)
  }

  return times
}

function describeFrequency(frequency: Frequency) {
  if (frequency.form === "interval") {
    return `every ${frequency.everyMinutes} minutes, ${frequency.days.join(", ")}, from ${frequency.startTime} through ${frequency.endTime}`
  }

  if (frequency.form === "once") {
    return `once at ${frequency.at}`
  }

  return `${frequency.days.join(", ")} at ${frequency.times.join(", ")}`
}

function parseAt(text: string, now: Date) {
  const match = text.trim().match(/^(?:(\d{4})-(\d{2})-(\d{2})[ T])?([01]\d|2[0-3]):([0-5]\d)$/)

  if (!match) {
    throw new Error('Give at as "HH:MM" or "YYYY-MM-DD HH:MM"')
  }

  const [, year, month, day, hours, minutes] = match
  const at = new Date(now)
  at.setSeconds(0, 0)

  if (year) {
    at.setFullYear(Number(year), Number(month) - 1, Number(day))
  }

  at.setHours(Number(hours), Number(minutes))

  if (!year && at <= now) {
    at.setDate(at.getDate() + 1)
  }

  return at
}

function frequencyFrom(params: Record<string, string>, current?: Routine) {
  if (params.everyMinutes) {
    return parse(routineSchemas.frequency, {
      form: "interval",
      everyMinutes: Number(params.everyMinutes),
      days: (params.days ?? "monday,tuesday,wednesday,thursday,friday").split(",").map((day) => day.trim().toLowerCase()).filter(Boolean),
      startTime: params.startTime ?? "00:00",
      endTime: params.endTime ?? "23:59",
    })
  }

  if (params.inMinutes) {
    return parse(routineSchemas.frequency, { form: "once", at: new Date(Date.now() + Number(params.inMinutes) * minute).toISOString() })
  }

  if (params.at) {
    return parse(routineSchemas.frequency, { form: "once", at: parseAt(params.at, new Date()).toISOString() })
  }

  if (params.days || params.times || params.time) {
    return parse(routineSchemas.frequency, { form: "fixed-time", days: (params.days ?? "").split(",").map((day) => day.trim().toLowerCase()).filter(Boolean), times: (params.times ?? params.time ?? "").split(",").map((time) => time.trim()).filter(Boolean) })
  }

  if (current) {
    return current.frequency
  }

  throw new Error("Give everyMinutes, days, startTime and endTime for an interval; days and times for fixed times; or inMinutes or at for a single call")
}

export function createRoutines(input: {
  database: AppDatabase
  bots: ReturnType<typeof createBots>
  observability: Observability
  conversations: { call(routine: Routine & { nextCallAt: string }): Promise<void> }
}) {
  let disposed = false
  let firing: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  function schedule() {
    clearTimeout(timer)

    if (disposed || firing) {
      return
    }

    const [earliest] = input.database.routines.listActive()

    if (!earliest?.nextCallAt) {
      return
    }

    const delay = Math.min(Math.max(Date.parse(earliest.nextCallAt) - Date.now(), 0), longestWait)
    timer = setTimeout(() => {
      firing = fire().catch((error: unknown) => {
        input.observability.event({ name: "routines.firefailed", error })
      }).finally(() => {
        firing = undefined
        schedule()
      })
    }, delay)
  }

  async function fire() {
    const now = new Date()
    const due = input.database.routines.listActive().filter((routine) => routine.nextCallAt && Date.parse(routine.nextCallAt) <= now.getTime())

    for (const scheduled of due) {
      if (disposed) {
        return
      }

      const routine = input.database.routines.get(scheduled.id)

      if (routine?.status !== "active" || !routine.nextCallAt || Date.parse(routine.nextCallAt) > now.getTime()) {
        continue
      }

      if (routine.frequency.form !== "once") {
        input.database.routines.update(routine.id, { nextCallAt: nextCall(routine.frequency, now).toISOString() })
      }

      await input.conversations.call({ ...routine, nextCallAt: routine.nextCallAt }).then(
        () => {
          if (routine.frequency.form === "once") {
            input.database.routines.update(routine.id, { status: "completed", nextCallAt: null })
          }
          input.observability.event({ name: "routines.called", context: { botId: routine.botId } })
        },
        (error) => {
          if (routine.frequency.form === "once") {
            input.database.routines.update(routine.id, { status: "failed", nextCallAt: null })
          }
          input.observability.event({ name: "routines.skipped", context: { botId: routine.botId }, error })
        },
      )
    }
  }

  function owner(botId: string) {
    const bot = input.bots.get(botId)

    if (!bot) {
      throw new Error("Bot not found")
    }

    if (bot.temporary) {
      throw new Error("A temporary member cannot have a Rotina")
    }

    return bot
  }

  function existing(id: string, botId?: string) {
    const routine = input.database.routines.get(id)

    if (!routine || (botId && routine.botId !== botId)) {
      throw new Error("Rotina not found")
    }

    return routine
  }

  function create(details: CreateRoutineInput) {
    const bot = owner(details.botId)
    const now = new Date()
    const routine: Routine = { id: crypto.randomUUID(), ...details, status: "active", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, nextCallAt: nextCall(details.frequency, now).toISOString(), favorite: false, createdAt: now.toISOString() }

    return input.observability.span({ name: "routines.create", context: { botId: bot.id } }, () => {
      const created = input.database.routines.create(routine)
      schedule()

      return created
    })
  }

  function update({ id, ...changes }: UpdateRoutineInput) {
    const routine = existing(id)

    return input.observability.span({ name: "routines.update", context: { botId: routine.botId } }, () => {
      const nextCallAt = changes.status === "active" ? nextCall(changes.frequency, new Date()).toISOString() : null
      const updated = input.database.routines.update(routine.id, { ...changes, nextCallAt })

      if (!updated) {
        throw new Error("Rotina not found")
      }

      schedule()

      return updated
    })
  }

  function updateFavorite({ id, favorite }: UpdateFavoriteInput) {
    const updated = input.database.routines.update(id, { favorite })

    if (!updated) {
      throw new Error("Rotina not found")
    }

    return updated
  }

  /** Calls the Rotina once now, outside its schedule: the next scheduled call and the status stay as they are. */
  async function fireNow(id: string) {
    const routine = existing(id)

    await input.conversations.call({ ...routine, nextCallAt: new Date().toISOString() })
    input.observability.event({ name: "routines.fired", context: { botId: routine.botId } })
  }

  function remove(id: string) {
    const routine = existing(id)

    input.observability.span({ name: "routines.remove", context: { botId: routine.botId } }, () => {
      input.database.routines.remove(routine.id)
      schedule()
    })
  }

  schedule()

  return {
    create,
    update,
    updateFavorite,
    fireNow,
    remove,
    list(botId: string) {
      return input.database.routines.listForBot(botId)
    },
    tools(bot: Pick<Bot, "id" | "temporary">): PiCustomTool[] {
      if (bot.temporary) {
        return []
      }

      return [{
        name: "routine",
        description: "Create or change one Rotina atomically: one named instruction with one schedule. Give an id to change an existing Rotina; omit it to create one. A schedule can repeat inside a weekday time window, contain multiple fixed times on chosen weekdays, or run once.",
        parameters: {
          "id?": "Id of the Rotina to change. Omit to create a new one.",
          "name?": "Short name for the Rotina. Required to create; omit to keep the current one.",
          "content?": "The message you receive at each call: what you must check or do. Required to create; omit to keep the current one.",
          "everyMinutes?": "Interval in minutes inside a time window.",
          "days?": "Comma-separated weekdays in English, for a fixed-time Rotina. Example: \"monday, friday\".",
          "times?": "Comma-separated local times as HH:MM for a fixed-time Rotina.",
          "startTime?": "Start of an interval window as HH:MM.",
          "endTime?": "Inclusive end of an interval window as HH:MM.",
          "inMinutes?": "Minutes from now, for a Rotina that runs once. Example: \"5\".",
          "at?": "Local time for a Rotina that runs once: \"HH:MM\" for the next such time, or \"YYYY-MM-DD HH:MM\".",
          "enabled?": "\"no\" to pause the Rotina, \"yes\" to resume it. Defaults to yes.",
          "favorite?": "\"yes\" to add the Rotina to the person's quick calls beside the conversation, \"no\" to remove it. Omit to keep the current choice.",
        },
        async execute(params) {
          const current = params.id ? existing(params.id, bot.id) : undefined
          const frequency = frequencyFrom(params, current)
          const status = statusFrom(params.enabled, current?.status)
          const name = params.name?.trim() || current?.name
          const content = params.content?.trim() || current?.content

          if (!name) {
            throw new Error("Give name: a short name for the Rotina")
          }

          if (!content) {
            throw new Error("Give content: the message you receive at each call")
          }

          const saved = current
            ? update({ id: current.id, name, content, frequency, status })
            : create({ botId: bot.id, name, content, frequency })
          const routine = updateFavorite({ id: saved.id, favorite: favoriteFrom(params.favorite, current) })

          return `Rotina ${routine.id} ${current ? "changed" : "created"}: "${routine.name}", ${describeFrequency(routine.frequency)}${routine.status === "paused" ? ", paused" : ""}${routine.favorite ? ", favorite" : ""}. Next call at ${routine.nextCallAt}.`
        },
      }, {
        name: "remove_routine",
        description: "Remove one of your Rotinas for good.",
        parameters: { id: "Id of the Rotina to remove" },
        async execute(params) {
          const routine = existing(params.id ?? "", bot.id)
          remove(routine.id)

          return `Rotina "${routine.name}" removed.`
        },
      }]
    },
    instructions(bot: Pick<Bot, "id" | "temporary" | "permissionMode">) {
      if (bot.temporary) {
        return ""
      }

      const routines = input.database.routines.listForBot(bot.id)
      const lines = routines.map((routine) => `- ${routine.id}: "${routine.name}" — ${routine.content}, ${describeFrequency(routine.frequency)}, ${routine.status}${routine.favorite ? ", favorite" : ""}`)

      return [
        "A turn with cause \"routine\" is a scheduled call from one of your Rotinas. Its content defines the work and notification criteria; the conversation protocol handles delivery or silent completion.",
        ...(bot.permissionMode === "read-only" ? [] : ["Use the routine tool once when the person asks you to check or do something on a schedule. Give the Rotina a short name and express repeated calls as one schedule. A one-time Rotina remains listed as completed or failed after its call. Use remove_routine to remove one for good. Set favorite when the person wants a Rotina among their quick calls."]),
        ...(lines.length > 0 ? ["Your Rotinas:", ...lines] : ["You have no Rotinas."]),
      ].join("\n")
    },
    async dispose() {
      disposed = true
      clearTimeout(timer)
      await firing
    },
  }
}
