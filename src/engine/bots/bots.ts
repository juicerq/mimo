import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { defaultBotAvatarSeed } from "@src/shared/bot-avatar"
import { botSchemas, type AddMemberInput, type Bot, type BotExecutionSettingInput, type Colleague, type CreateBotInput, type StoredBot, type UpdateBotInput, type UpdateBotProjectInput } from "@src/shared/bots"
import { botPermissionModes } from "@src/shared/bot-permissions"
import type { ProviderAvailability, ProviderModels } from "@src/shared/providers"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import { assertAccessibleWorkingDirectory } from "../projects/working-directory"
import { parse } from "@src/shared/parse"
import { loadPiSkills } from "../pi/pi-skills"

interface BotsDependencies {
  database: AppDatabase
  observability: Observability
  privateBotsDirectory: string
  providers: { list(): Promise<ProviderAvailability[]>; models(): Promise<ProviderModels[]> }
  conversations: { close(botId: string): Promise<void>; isActive(botId: string): boolean; setPermissionMode(botId: string, mode: StoredBot["permissionMode"]): void }
}

function executionChange(input: BotExecutionSettingInput) {
  if (input.setting === "effort") {
    return { effort: input.value }
  }

  if (input.setting === "model") {
    return { provider: input.value.provider, model: input.value.model }
  }

  return { permissionMode: input.value }
}

export function newBot(bot: Pick<StoredBot, "name" | "provider" | "function" | "leaderBotId" | "projectId" | "workingDirectoryOverride"> & Partial<Pick<StoredBot, "avatarSeed" | "temporary" | "createdAt">>): StoredBot {
  return {
    ...bot,
    id: crypto.randomUUID(),
    avatarSeed: bot.avatarSeed ?? defaultBotAvatarSeed(bot.name),
    temporary: bot.temporary ?? false,
    pinned: false,
    memoryEnabled: true,
    effort: "medium",
    model: null,
    permissionMode: "ask",
    inheritMemberPermissions: false,
    createdAt: bot.createdAt ?? new Date().toISOString(),
  }
}

export function createBots({ database, observability, privateBotsDirectory, providers, conversations }: BotsDependencies) {
  async function privateDirectory(botId: string) {
    const path = join(privateBotsDirectory, botId)
    await mkdir(path, { recursive: true })

    return path
  }

  function projectWorkingDirectory(projectId: string | null) {
    if (!projectId) {
      return
    }

    const project = database.projects.get(projectId)

    if (!project) {
      throw new Error("Project not found")
    }

    return project.defaultWorkingDirectory
  }

  function workspaceFor(input: CreateBotInput): Pick<StoredBot, "leaderBotId" | "projectId" | "workingDirectoryOverride"> {
    if ("leaderBotId" in input) {
      const leader = database.bots.get(input.leaderBotId)

      if (!leader) {
        throw new Error("Leader not found")
      }

      if (leader.leaderBotId) {
        throw new Error("A member cannot lead")
      }

      return { leaderBotId: leader.id, projectId: leader.projectId, workingDirectoryOverride: input.workingDirectoryOverride ?? leader.workingDirectoryOverride }
    }

    if (input.projectId) {
      projectWorkingDirectory(input.projectId)
    }

    return { leaderBotId: null, projectId: input.projectId ?? null, workingDirectoryOverride: input.workingDirectoryOverride ?? null }
  }

  function colleagueIdsByBot(relations = database.colleagues.list()) {
    const grouped = new Map<string, string[]>()

    for (const relation of relations) {
      grouped.set(relation.botId, [...(grouped.get(relation.botId) ?? []), relation.colleagueBotId])
    }

    return grouped
  }

  function present(storedBot: StoredBot, workingAssigneeIds = database.tasks.workingAssigneeIds(), colleagueIds = colleagueIdsByBot(database.colleagues.listForBot(storedBot.id))): Bot {
    const effectiveWorkingDirectory = storedBot.workingDirectoryOverride
      ?? projectWorkingDirectory(storedBot.projectId)
      ?? join(privateBotsDirectory, storedBot.id)
    const closed = storedBot.temporary && !workingAssigneeIds.has(storedBot.id)

    return { ...storedBot, effectiveWorkingDirectory, closed, colleagueIds: colleagueIds.get(storedBot.id) ?? [] }
  }

  function list() {
    const workingAssigneeIds = database.tasks.workingAssigneeIds()
    const colleagueIds = colleagueIdsByBot()
    return database.bots.list().map((storedBot) => present(storedBot, workingAssigneeIds, colleagueIds))
  }

  async function store(storedBot: StoredBot) {
    await privateDirectory(storedBot.id)

    return observability.span(
      { name: "bots.create", context: { botId: storedBot.id, provider: storedBot.provider, ...(storedBot.projectId ? { projectId: storedBot.projectId } : {}), ...(storedBot.leaderBotId ? { leaderBotId: storedBot.leaderBotId } : {}) }, attributes: { state: storedBot.temporary ? "temporary" : "permanent" } },
      () => present(database.bots.create(storedBot)),
    )
  }

  async function memberModel(provider: StoredBot["provider"], modelId: string | null) {
    const catalog = (await providers.models()).find((entry) => entry.provider === provider)
    const model = modelId ?? catalog?.default

    if (!model || !catalog || !catalog.models.some((entry) => entry.id === model)) {
      throw new Error(`Model ${model ?? "default"} is unavailable for ${provider}. Available models: ${catalog?.models.map((entry) => entry.id).join(", ") || "none"}`)
    }

    return model
  }

  async function memberExecution(leader: Bot, current: Bot, rawSettings: unknown) {
    const settings = parse(botSchemas.memberSettings, rawSettings)
    const provider = settings.provider ?? current.provider
    const modelId = settings.model ?? (provider === current.provider ? current.model : null)
    const model = settings.provider || settings.model ? await memberModel(provider, modelId) : current.model

    const permissionMode = settings.permissionMode ?? current.permissionMode
    const workingDirectoryOverride = settings.cwd ?? current.workingDirectoryOverride

    if (settings.cwd) {
      await assertAccessibleWorkingDirectory(settings.cwd)
    }
    const latestLeader = database.bots.get(leader.id)

    if (!latestLeader || botPermissionModes.indexOf(permissionMode) > botPermissionModes.indexOf(latestLeader.permissionMode)) {
      throw new Error("A member cannot receive more permission than its Leader. Ask the person to change the Leader permission first.")
    }

    return { provider, model, effort: settings.effort ?? current.effort, permissionMode, workingDirectoryOverride }
  }

  function assertTeamIdle(bot: Pick<StoredBot, "id" | "leaderBotId">, leaderId?: string) {
    if ([bot.id, bot.leaderBotId, leaderId].some((id) => id && conversations.isActive(id)) || database.tasks.listForBot(bot.id).some((task) => task.status === "working")) {
      throw new Error("Aguarde o Bot e os Líderes terminarem o trabalho antes de mudar o time.")
    }
  }

  return {
    models: () => providers.models(),
    addMember(input: AddMemberInput) {
      const leader = database.bots.get(input.leaderBotId)
      const bot = database.bots.get(input.botId)

      if (!leader || !bot) {
        throw new Error("Bot não encontrado. Atualize a lista e tente novamente.")
      }

      if (leader.id === bot.id || leader.leaderBotId || leader.temporary) {
        throw new Error("Escolha um Líder que não seja Integrante de outro time.")
      }

      if (bot.leaderBotId === leader.id) {
        return present(bot)
      }

      if (bot.temporary || database.bots.list().some((candidate) => candidate.leaderBotId === bot.id)) {
        throw new Error("Escolha um Bot permanente que não tenha Integrantes.")
      }

      assertTeamIdle(bot, leader.id)

      return observability.span({ name: "bots.memberadd", context: { botId: bot.id, leaderBotId: leader.id } }, () => {
        const updated = database.bots.addMember({ id: bot.id, leaderBotId: leader.id, projectId: leader.projectId, workingDirectoryOverride: bot.projectId === leader.projectId ? bot.workingDirectoryOverride : present(bot).effectiveWorkingDirectory })

        if (!updated) {
          throw new Error("Bot não encontrado.")
        }

        return present(updated)
      })
    },
    detachMember(id: string) {
      const bot = database.bots.get(id)

      if (!bot) {
        throw new Error("Bot não encontrado. Atualize a lista e tente novamente.")
      }

      if (bot.temporary) {
        throw new Error("Integrantes temporários permanecem ligados à sua Tarefa e não podem ser desvinculados.")
      }

      if (!bot.leaderBotId) {
        return present(bot)
      }

      assertTeamIdle(bot)

      return observability.span({ name: "bots.memberdetach", context: { botId: bot.id, leaderBotId: bot.leaderBotId } }, () => {
        const updated = database.bots.detachMember(bot.id)

        if (!updated) {
          throw new Error("Bot não encontrado.")
        }

        return present(updated)
      })
    },
    async create(input: CreateBotInput) {
      const availableProviders = await providers.list()
      const selectedProvider = availableProviders.find((provider) => provider.status === "available")

      if (!selectedProvider) {
        throw new Error("No Provider is connected")
      }

      const workspace = workspaceFor(input)

      if (input.workingDirectoryOverride) {
        await assertAccessibleWorkingDirectory(input.workingDirectoryOverride)
      }

      return store(newBot({
        ...workspace,
        name: input.name,
        avatarSeed: input.avatarSeed,
        provider: selectedProvider.provider,
        function: input.function ?? { outcome: "Ajudar no que você precisar" },
      }))
    },
    async hire(leader: Pick<StoredBot, "id">, rawDetails: unknown) {
      const { name, function: botFunction, permanent, ...settings } = parse(botSchemas.hireInput, rawDetails)
      const storedLeader = database.bots.get(leader.id)

      if (!storedLeader || storedLeader.leaderBotId) {
        throw new Error("Only a Leader can hire members")
      }

      const current = present(storedLeader)
      await privateDirectory(current.id)
      const execution = await memberExecution(current, { ...current, permissionMode: current.inheritMemberPermissions ? current.permissionMode : "ask" }, { provider: current.provider, cwd: current.effectiveWorkingDirectory, ...settings })

      return store({ ...newBot({
        leaderBotId: current.id,
        projectId: current.projectId,
        name,
        provider: execution.provider,
        function: botFunction,
        workingDirectoryOverride: execution.workingDirectoryOverride,
        temporary: !permanent,
      }), ...execution })
    },
    async configureMember(leaderId: string, memberId: string, rawSettings: unknown) {
      const leader = database.bots.get(leaderId)
      const member = database.bots.get(memberId)

      if (!leader || leader.leaderBotId || !member || member.leaderBotId !== leader.id) {
        throw new Error("You can only configure members of your own team")
      }

      const execution = await memberExecution(present(leader), present(member), rawSettings)

      if (database.bots.get(member.id)?.leaderBotId !== leader.id) {
        throw new Error("The member left your team while configuring it")
      }

      const updated = database.bots.updateExecution(member.id, execution)

      if (!updated) {
        throw new Error("Bot not found")
      }

      conversations.setPermissionMode(member.id, updated.permissionMode)

      return present(updated)
    },
    list,
    async skills(botId: string) {
      const storedBot = database.bots.get(botId)

      if (!storedBot) {
        throw new Error("Bot not found")
      }

      const { skills } = await loadPiSkills(present(storedBot).effectiveWorkingDirectory)

      return skills.map(({ name, description }) => ({ name, description })).sort((first, second) => first.name.localeCompare(second.name))
    },
    get(id: string) {
      const storedBot = database.bots.get(id)

      if (!storedBot) {
        return
      }

      return present(storedBot)
    },
    colleagues(bot: Pick<Bot, "id">) {
      const colleagueIds = database.colleagues.listForBot(bot.id).map((relation) => relation.colleagueBotId)

      return list().filter((candidate) => colleagueIds.includes(candidate.id))
    },
    addColleague(botId: string, colleagueBotId: string) {
      const caller = database.bots.get(botId)
      const target = database.bots.get(colleagueBotId)

      if (!caller || !target) {
        throw new Error("Bot not found")
      }

      if (caller.temporary) {
        throw new Error(`${caller.name} is temporary and cannot have Colegas`)
      }

      if (target.id === caller.id) {
        throw new Error(`${caller.name} cannot be its own Colega`)
      }

      if (target.leaderBotId) {
        throw new Error(`${target.name} is a member of a team and cannot be a Colega`)
      }

      return observability.span(
        { name: "bots.colleagueadd", context: { botId: caller.id } },
        () => database.colleagues.set({ botId: caller.id, colleagueBotId: target.id }),
      )
    },
    removeColleague(input: Colleague) {
      const removed = observability.span({ name: "bots.colleagueremove", context: { botId: input.botId } }, () => database.colleagues.remove(input.botId, input.colleagueBotId))

      if (removed === 0) {
        throw new Error("Colega not found")
      }
    },
    async update(input: UpdateBotInput) {
      const { id, ...changes } = input
      const storedBot = database.bots.get(id)

      if (!storedBot) {
        throw new Error("Bot not found")
      }

      if (changes.projectId) {
        projectWorkingDirectory(changes.projectId)
      }

      if (changes.workingDirectoryOverride) {
        await assertAccessibleWorkingDirectory(changes.workingDirectoryOverride)
      }

      if (storedBot.leaderBotId) {
        const leader = database.bots.get(storedBot.leaderBotId)

        if (!leader || leader.projectId !== changes.projectId) {
          throw new Error("A member must remain in the Leader Project")
        }
      }

      return observability.span(
        { name: "bots.update", context: { botId: storedBot.id, ...(changes.projectId ? { projectId: changes.projectId } : {}) } },
        () => {
          const updated = database.bots.update(storedBot.id, changes)

          if (!updated) {
            throw new Error("Bot not found")
          }

          conversations.setPermissionMode(updated.id, updated.permissionMode)

          return present(updated)
        },
      )
    },
    updateExecution(input: BotExecutionSettingInput) {
      const updated = database.bots.updateExecution(input.id, executionChange(input))

      if (!updated) {
        throw new Error("Bot not found")
      }

      conversations.setPermissionMode(updated.id, updated.permissionMode)

      return present(updated)
    },
    /** Moves a root Bot with its Integrantes; an Integrante leaves its time to move alone. */
    updateProject(input: UpdateBotProjectInput) {
      const storedBot = database.bots.get(input.id)

      if (!storedBot) {
        throw new Error("Bot não encontrado. Atualize a lista e tente novamente.")
      }

      if (storedBot.temporary) {
        throw new Error("Integrantes temporários permanecem ligados à sua Tarefa e não mudam de Projeto.")
      }

      if (input.projectId) {
        projectWorkingDirectory(input.projectId)
      }

      if (storedBot.leaderBotId) {
        assertTeamIdle(storedBot)
      }

      return observability.span(
        { name: "bots.projectupdate", context: { botId: storedBot.id, ...(input.projectId ? { projectId: input.projectId } : {}) } },
        () => {
          const updated = database.bots.updateProject(storedBot.id, input.projectId)

          if (!updated) {
            throw new Error("Bot não encontrado.")
          }

          return present(updated)
        },
      )
    },
    updatePinned(rawInput: unknown) {
      const input = parse(botSchemas.updatePinnedInput, rawInput)
      const updated = database.bots.updatePinned(input.id, input.pinned)

      if (!updated) {
        throw new Error("Bot not found")
      }

      return present(updated)
    },
    async remove(id: string) {
      const storedBot = database.bots.get(id)

      if (!storedBot) {
        throw new Error("Bot not found")
      }

      const members = database.bots.list().filter((candidate) => candidate.leaderBotId === storedBot.id)
      const team = [storedBot, ...members]

      await observability.span(
        { name: "bots.remove", context: { botId: storedBot.id }, attributes: { count: team.length } },
        async () => {
          for (const bot of team) {
            await conversations.close(bot.id)
          }

          database.bots.remove(storedBot.id)
          await Promise.all(team.map((bot) => rm(join(privateBotsDirectory, bot.id), { recursive: true, force: true })))
        },
      )
    },
    async directory(botId: string) {
      if (!database.bots.get(botId)) {
        throw new Error("Bot not found")
      }

      return privateDirectory(botId)
    },
    async resolveWorkingDirectory(botId: string) {
      const storedBot = database.bots.get(botId)

      if (!storedBot) {
        throw new Error("Bot not found")
      }

      await privateDirectory(storedBot.id)
      const effectiveWorkingDirectory = present(storedBot).effectiveWorkingDirectory
      await assertAccessibleWorkingDirectory(effectiveWorkingDirectory)

      return effectiveWorkingDirectory
    },
  }
}
