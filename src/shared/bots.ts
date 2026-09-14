import { z } from "zod"
import { id, optionalId } from "./ids"
import { botEfforts } from "./bot-efforts"
import { botPermissionModes } from "./bot-permissions"
import { providerName } from "./providers"

const avatarSeed = z.string().min(1).max(256)
const botFunction = z.strictObject({ outcome: id, description: id.optional() })
const botEffort = z.enum(botEfforts)
const botPermissionMode = z.enum(botPermissionModes)
export const workingDirectory = z.string().min(1)
const storedBot = z.strictObject({
  id,
  avatarSeed,
  leaderBotId: optionalId,
  projectId: optionalId,
  name: id,
  provider: providerName,
  function: botFunction,
  workingDirectoryOverride: workingDirectory.nullable(),
  temporary: z.boolean(),
  pinned: z.boolean(),
  memoryEnabled: z.boolean(),
  effort: botEffort,
  model: optionalId,
  permissionMode: botPermissionMode,
  inheritMemberPermissions: z.boolean(),
  createdAt: id,
})
const bot = storedBot.extend({ effectiveWorkingDirectory: workingDirectory, closed: z.boolean(), colleagueIds: z.array(id) })
const colleague = z.strictObject({ botId: id, colleagueBotId: id })
const createFields = { name: id, avatarSeed: avatarSeed.optional(), function: botFunction.optional(), workingDirectoryOverride: workingDirectory.optional() }
const createInput = z.union([
  z.strictObject({ ...createFields, projectId: id.optional() }),
  z.strictObject({ ...createFields, leaderBotId: id }),
])
const updateExecutionInput = z.discriminatedUnion("setting", [
  z.strictObject({ id, setting: z.literal("effort"), value: botEffort }),
  z.strictObject({ id, setting: z.literal("model"), value: z.strictObject({ provider: providerName, model: id }) }),
  z.strictObject({ id, setting: z.literal("permissionMode"), value: botPermissionMode }),
])
const updatePinnedInput = z.strictObject({ id, pinned: z.boolean() })
const updateProjectInput = z.strictObject({ id, projectId: optionalId })

const memberSettings = z.strictObject({
  provider: providerName.optional(),
  model: id.optional(),
  effort: botEffort.optional(),
  cwd: workingDirectory.optional(),
  permissionMode: botPermissionMode.optional(),
})

export const botSchemas = {
  memberSettings,
  createInput,
  addMemberInput: z.strictObject({ leaderBotId: id, botId: id }),
  hireInput: z.strictObject({ name: id, function: botFunction, permanent: z.boolean(), ...memberSettings.shape }),
  colleagueInput: colleague,
  colleagueList: z.array(colleague),
  updateInput: z.strictObject({ id, name: id, function: botFunction, projectId: optionalId, workingDirectoryOverride: workingDirectory.nullable(), memoryEnabled: z.boolean(), effort: botEffort, model: optionalId, permissionMode: botPermissionMode, inheritMemberPermissions: z.boolean().optional() }),
  updateExecutionInput,
  updatePinnedInput,
  updateProjectInput,
  storedBot,
  storedBotList: z.array(storedBot),
  bot,
  botList: z.array(bot),
}

export type Bot = z.infer<typeof bot>
export type Colleague = z.infer<typeof colleague>
export type CreateBotInput = z.infer<typeof createInput>
export type StoredBot = z.infer<typeof storedBot>
export type BotEffort = z.infer<typeof botEffort>
export type BotExecutionSettingInput = z.infer<typeof updateExecutionInput>
export type BotExecutionSettingChange = BotExecutionSettingInput extends infer Change
  ? Change extends { id: string } ? Omit<Change, "id"> : never
  : never
export type AddMemberInput = z.infer<typeof botSchemas.addMemberInput>
export type UpdateBotInput = z.infer<typeof botSchemas.updateInput>
export type UpdateBotProjectInput = z.infer<typeof updateProjectInput>
