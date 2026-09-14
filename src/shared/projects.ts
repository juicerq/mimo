import { z } from "zod"
import { id } from "./ids"
import { botSchemas, workingDirectory } from "./bots"

const project = z.strictObject({
  id,
  name: id,
  defaultWorkingDirectory: workingDirectory.nullable(),
  createdAt: id,
})
const botWithMembers = botSchemas.bot.extend({ members: z.array(botSchemas.bot) })
const projectWithBots = project.extend({ bots: z.array(botWithMembers) })
const groupedList = z.strictObject({ projects: z.array(projectWithBots), unassignedBots: z.array(botWithMembers) })

export const projectSchemas = {
  createInput: z.strictObject({ name: id, defaultWorkingDirectory: workingDirectory.optional() }),
  updateInput: z.strictObject({ id, name: id, defaultWorkingDirectory: workingDirectory.nullable() }),
  project,
  projectList: z.array(project),
  groupedList,
}

export type Project = z.infer<typeof project>
export type ProjectGroups = z.infer<typeof groupedList>
export type CreateProjectInput = z.infer<typeof projectSchemas.createInput>
export type UpdateProjectInput = z.infer<typeof projectSchemas.updateInput>
