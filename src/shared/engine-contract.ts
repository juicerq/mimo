import { eventIterator, oc } from "@orpc/contract"
import { z } from "zod"
import { diagnosticExportResult, diagnosticsReport } from "./observability/diagnostics"
import { externalObservationSpan } from "./observability/observation"
import { providerLogin, providerLoginInput, providerLoginReply, providerAvailabilityList, providerConnectInput, providerDisconnectInput, providerModelsList } from "./providers"
import { botArchiveSchemas } from "./bot-archive"
import { botSchemas } from "./bots"
import { browserFrame, browserFrameInput, browserPages } from "./browser"
import { botInput, idInput } from "./ids"
import { conversationSchemas } from "./conversations"
import { memorySchemas } from "./memory"
import { projectSchemas } from "./projects"
import { permissionSchemas } from "./permissions"
import { pluginSchemas } from "./plugins"
import { routineSchemas } from "./routines"
import { taskSchemas } from "./tasks"
import { triggerSchemas } from "./triggers"
import { skillList } from "./skills"

const healthOutput = z.object({
  status: z.literal("ready"),
  runtime: z.string(),
  startedAt: z.string(),
})

export const engineContract = {
  health: oc.output(healthOutput).route({ method: "GET", path: "/health" }),
  diagnostics: {
    get: oc.output(diagnosticsReport).route({ method: "GET", path: "/diagnostics" }),
    export: oc.output(diagnosticExportResult).route({ method: "POST", path: "/diagnostics/export" }),
  },
  providers: {
    login: oc.output(providerLogin).route({ method: "POST", path: "/providers/login" }),
    loginStatus: oc.input(providerLoginInput).output(providerLogin).route({ method: "POST", path: "/providers/login/status" }),
    loginReply: oc.input(providerLoginReply).route({ method: "POST", path: "/providers/login/reply" }),
    cancelLogin: oc.input(providerLoginInput).output(providerLogin).route({ method: "POST", path: "/providers/login/cancel" }),
    list: oc.output(providerAvailabilityList).route({ method: "GET", path: "/providers" }),
    models: oc.output(providerModelsList).route({ method: "GET", path: "/providers/models" }),
    refreshModels: oc.route({ method: "POST", path: "/providers/models/refresh" }),
    connect: oc.input(providerConnectInput).output(providerAvailabilityList).route({ method: "POST", path: "/providers/connect" }),
    disconnect: oc.input(providerDisconnectInput).output(providerAvailabilityList).route({ method: "POST", path: "/providers/disconnect" }),
  },
  projects: {
    create: oc.input(projectSchemas.createInput).output(projectSchemas.project).route({ method: "POST", path: "/projects" }),
    list: oc.output(projectSchemas.groupedList).route({ method: "GET", path: "/projects" }),
    update: oc.input(projectSchemas.updateInput).output(projectSchemas.project).route({ method: "POST", path: "/projects/{id}/update" }),
    remove: oc.input(idInput).route({ method: "POST", path: "/projects/{id}/remove" }),
  },
  bots: {
    skills: oc.input(botInput).output(skillList).route({ method: "GET", path: "/bots/{botId}/skills" }),
    create: oc.input(botSchemas.createInput).output(botSchemas.bot).route({ method: "POST", path: "/bots" }),
    addMember: oc.input(botSchemas.addMemberInput).output(botSchemas.bot).route({ method: "POST", path: "/bots/{leaderBotId}/members" }),
    detachMember: oc.input(idInput).output(botSchemas.bot).route({ method: "POST", path: "/bots/{id}/detach" }),
    list: oc.output(botSchemas.botList).route({ method: "GET", path: "/bots" }),
    get: oc.input(idInput).output(botSchemas.bot).route({ method: "GET", path: "/bots/{id}" }),
    update: oc.input(botSchemas.updateInput).output(botSchemas.bot).route({ method: "POST", path: "/bots/{id}/update" }),
    updatePinned: oc.input(botSchemas.updatePinnedInput).output(botSchemas.bot).route({ method: "POST", path: "/bots/{id}/pinned" }),
    updateProject: oc.input(botSchemas.updateProjectInput).output(botSchemas.bot).route({ method: "POST", path: "/bots/{id}/project" }),
    updateExecution: oc.input(botSchemas.updateExecutionInput).output(botSchemas.bot).route({ method: "POST", path: "/bots/{id}/execution" }),
    remove: oc.input(idInput).route({ method: "POST", path: "/bots/{id}/remove" }),
    removeColleague: oc.input(botSchemas.colleagueInput).route({ method: "POST", path: "/bots/{botId}/colleagues/{colleagueBotId}/remove" }),
  },
  archive: {
    list: oc.input(botArchiveSchemas.input).output(botArchiveSchemas.listing).route({ method: "GET", path: "/bots/{botId}/archive" }),
    preview: oc.input(botArchiveSchemas.input).output(botArchiveSchemas.preview).route({ method: "GET", path: "/bots/{botId}/archive/preview" }),
  },
  conversations: {
    overview: oc.output(conversationSchemas.overview).route({ method: "GET", path: "/conversations/overview" }),
    history: oc.input(conversationSchemas.historyInput).output(conversationSchemas.history).route({ method: "GET", path: "/bots/{botId}/messages" }),
    events: oc.output(eventIterator(conversationSchemas.botEvent)).route({ method: "GET", path: "/conversations/events" }),
    send: oc.input(conversationSchemas.sendInput).route({ method: "POST", path: "/bots/{botId}/messages" }),
    newSession: oc.input(botInput).route({ method: "POST", path: "/bots/{botId}/new-session" }),
    reload: oc.input(botInput).route({ method: "POST", path: "/bots/{botId}/reload" }),
    compact: oc.input(conversationSchemas.compactInput).output(conversationSchemas.compactionResult).route({ method: "POST", path: "/bots/{botId}/compact" }),
    abort: oc.input(botInput).route({ method: "POST", path: "/bots/{botId}/abort" }),
    abortTeam: oc.input(botInput).route({ method: "POST", path: "/bots/{botId}/team/abort" }),
    teamWorking: oc.input(botInput).output(z.boolean()).route({ method: "GET", path: "/bots/{botId}/team/working" }),
    promote: oc.input(conversationSchemas.queueInput).route({ method: "POST", path: "/bots/{botId}/queue/{id}/promote" }),
    unqueue: oc.input(conversationSchemas.queueInput).route({ method: "POST", path: "/bots/{botId}/queue/{id}/remove" }),
    related: oc.input(conversationSchemas.taskInput).output(conversationSchemas.messageList).route({ method: "GET", path: "/tasks/{taskId}/messages" }),
  },
  browser: {
    pages: oc.output(eventIterator(z.object({ pages: browserPages }))).route({ method: "GET", path: "/browser/pages" }),
    frame: oc.input(browserFrameInput).output(browserFrame.nullable()).route({ method: "GET", path: "/browser/{botId}/frame" }),
  },
  permissions: {
    decide: oc.input(permissionSchemas.decideInput).route({ method: "POST", path: "/bots/{botId}/permission-requests/{requestId}" }),
  },
  tasks: {
    listForBot: oc.input(botInput).output(taskSchemas.taskList).route({ method: "GET", path: "/bots/{botId}/tasks" }),
  },
  routines: {
    create: oc.input(routineSchemas.createInput).output(routineSchemas.routine).route({ method: "POST", path: "/routines" }),
    list: oc.input(botInput).output(routineSchemas.routineList).route({ method: "GET", path: "/bots/{botId}/routines" }),
    update: oc.input(routineSchemas.updateInput).output(routineSchemas.routine).route({ method: "POST", path: "/routines/{id}/update" }),
    remove: oc.input(idInput).route({ method: "POST", path: "/routines/{id}/remove" }),
  },
  triggers: {
    create: oc.input(triggerSchemas.createInput).output(triggerSchemas.trigger).route({ method: "POST", path: "/triggers" }),
    list: oc.input(botInput).output(triggerSchemas.triggerList).route({ method: "GET", path: "/bots/{botId}/triggers" }),
    update: oc.input(triggerSchemas.updateInput).output(triggerSchemas.trigger).route({ method: "POST", path: "/triggers/{id}/update" }),
    remove: oc.input(idInput).route({ method: "POST", path: "/triggers/{id}/remove" }),
  },
  memory: {
    settings: oc.output(memorySchemas.settings).route({ method: "GET", path: "/memory/settings" }),
    configure: oc.input(memorySchemas.configure).route({ method: "POST", path: "/memory/settings" }),
    status: oc.output(memorySchemas.status).route({ method: "GET", path: "/memory/status" }),
    retry: oc.input(botInput).route({ method: "POST", path: "/bots/{botId}/memory/retry" }),
    list: oc.input(botInput).output(memorySchemas.memoryList).route({ method: "GET", path: "/bots/{botId}/memories" }),
    add: oc.input(memorySchemas.addInput).output(memorySchemas.memory).route({ method: "POST", path: "/bots/{botId}/memories" }),
    update: oc.input(memorySchemas.updateInput).output(memorySchemas.memory).route({ method: "POST", path: "/memories/{id}/update" }),
    forget: oc.input(idInput).route({ method: "POST", path: "/memories/{id}/forget" }),
    clear: oc.input(botInput).route({ method: "POST", path: "/bots/{botId}/memories/clear" }),
  },
  plugins: {
    list: oc.output(pluginSchemas.snapshot).route({ method: "GET", path: "/plugins" }),
    addCustom: oc.input(pluginSchemas.addCustomInput).output(pluginSchemas.snapshot).route({ method: "POST", path: "/plugins" }),
    remove: oc.input(idInput).output(pluginSchemas.snapshot).route({ method: "POST", path: "/plugins/{id}/remove" }),
    connect: oc.input(pluginSchemas.connectInput).output(pluginSchemas.connectOutput).route({ method: "POST", path: "/plugins/{pluginId}/connect" }),
    connectionSteps: oc.input(pluginSchemas.connectionInput).output(eventIterator(pluginSchemas.step)).route({ method: "GET", path: "/plugins/connections/{connectionId}/steps" }),
    awaitConnection: oc.input(pluginSchemas.connectionInput).output(pluginSchemas.snapshot).route({ method: "POST", path: "/plugins/connections/{connectionId}" }),
    disconnect: oc.input(pluginSchemas.accountInput).output(pluginSchemas.snapshot).route({ method: "POST", path: "/plugins/accounts/{accountId}/disconnect" }),
    grant: oc.input(pluginSchemas.grantInput).output(pluginSchemas.snapshot).route({ method: "POST", path: "/bots/{botId}/accounts/{accountId}" }),
    decide: oc.input(pluginSchemas.decideInput).route({ method: "POST", path: "/bots/{botId}/plugin-requests/{requestId}" }),
  },
  observations: {
    rendererSpan: oc.input(externalObservationSpan).route({ method: "POST", path: "/observations/renderer-span" }),
  },
}
