import type { CreateProjectInput, Project, UpdateProjectInput } from "@src/shared/projects"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import type { createBots } from "../bots/bots"
import { assertAccessibleWorkingDirectory } from "./working-directory"

interface ProjectsDependencies {
  database: AppDatabase
  observability: Observability
  bots: Pick<ReturnType<typeof createBots>, "list">
}

export function createProjects({ database, observability, bots }: ProjectsDependencies) {
  return {
    async create(input: CreateProjectInput) {
      if (input.defaultWorkingDirectory) {
        await assertAccessibleWorkingDirectory(input.defaultWorkingDirectory)
      }

      const project: Project = { id: crypto.randomUUID(), ...input, defaultWorkingDirectory: input.defaultWorkingDirectory ?? null, createdAt: new Date().toISOString() }

      return observability.span(
        { name: "projects.create", context: { projectId: project.id } },
        () => database.projects.create(project),
      )
    },
    list() {
      const allBots = bots.list()
      const membersByLeader = Map.groupBy(allBots.filter((bot) => bot.leaderBotId !== null), (bot) => bot.leaderBotId)
      const roots = allBots.filter((bot) => bot.leaderBotId === null).map((bot) => ({ ...bot, members: membersByLeader.get(bot.id) ?? [] }))
      const botsByProject = Map.groupBy(roots, (bot) => bot.projectId)

      return {
        projects: database.projects.list().map((project) => ({ ...project, bots: botsByProject.get(project.id) ?? [] })),
        unassignedBots: botsByProject.get(null) ?? [],
      }
    },
    async update(input: UpdateProjectInput) {
      const { id, ...changes } = input

      if (changes.defaultWorkingDirectory) {
        await assertAccessibleWorkingDirectory(changes.defaultWorkingDirectory)
      }

      return observability.span({ name: "projects.update", context: { projectId: id } }, () => {
        const updated = database.projects.update(id, changes)

        if (!updated) {
          throw new Error("Projeto não encontrado. Atualize a lista e tente novamente.")
        }

        return updated
      })
    },
    /** Bots keep their data and become unassigned; the schema sets their projectId to null. */
    remove(id: string) {
      const removed = observability.span({ name: "projects.remove", context: { projectId: id } }, () => database.projects.remove(id))

      if (removed === 0) {
        throw new Error("Projeto não encontrado. Atualize a lista e tente novamente.")
      }
    },
  }
}
