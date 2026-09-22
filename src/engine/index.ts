import { browserMainMessage } from "../shared/browser"
import { createBrowser } from "./browser/browser"
import { createJev } from "./browser/jev"
import { RPCHandler } from "@orpc/server/fetch"
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth"
import { z } from "zod"
import { dirname, join } from "node:path"
import { engineAccessMessage, forwardedObservation } from "../shared/engine-ipc"
import type { ProcessState } from "../shared/observability/diagnostics"
import { parse } from "../shared/parse"
import { createEngineRouter } from "./app/engine-app"
import { createEngineServer } from "./app/engine-server"
import { createDiagnostics } from "./observability/diagnostics"
import { createObservationSystem } from "./observability/observability"
import { openDatabase } from "./persistence/database"
import { createBots } from "./bots/bots"
import { createConversations } from "./conversations/conversations"
import { createMemory } from "./memory/memory"
import { createGmailAdapter } from "./plugins/gmail/gmail"
import { createGithubAdapter } from "./plugins/github/github"
import { createMcpAdapter } from "./plugins/mcp/mcp"
import { createWhatsappAdapter } from "./plugins/whatsapp/whatsapp"
import { createPlugins } from "./plugins/plugins"
import { createSecrets } from "../shared/secrets"
import { createPiAgentRuntime, deferPiSessionFactory } from "./pi/pi-agent-runtime"
import { createPiLoadSessionFactory } from "./pi/pi-load-session"
import { createPiModels } from "./pi/pi-models"
import { createPiProvider } from "./pi/pi-provider"
import { createProjects } from "./projects/projects"
import { createRoutines } from "./routines/routines"
import { createTasks } from "./tasks/tasks"
import { createTriggers } from "./triggers/triggers"
import { createWebSearch } from "./web/web-search"

registerBunOAuthFlows()

const environmentSchema = z.object({
  BOT_TEAMS_ENGINE_TOKEN: z.string().min(1),
  BOT_TEAMS_ENGINE_PORT: z.coerce.number().int().min(0).max(65535).default(0),
  BOT_TEAMS_ALLOWED_ORIGIN: z.url({ protocol: /^https$/ }).optional(),
  BOT_TEAMS_RENDERER_DIRECTORY: z.string().min(1).optional(),
  BOT_TEAMS_DATABASE_PATH: z.string().min(1),
  BOT_TEAMS_PRIVATE_BOTS_DIRECTORY: z.string().min(1),
  BOT_TEAMS_DEVELOPMENT: z.enum(["true", "false"]),
  BOT_TEAMS_LOAD_PROVIDER: z.enum(["true", "false"]),
  BOT_TEAMS_APP_VERSION: z.string().min(1),
  BOT_TEAMS_ELECTRON_VERSION: z.string().min(1),
  BOT_TEAMS_SECRET_KEY: z.string().regex(/^[0-9a-f]{64}$/),
  BOT_TEAMS_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  BOT_TEAMS_GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  BOT_TEAMS_GITHUB_RELAY_URL: z.url().optional(),
})
const environment = parse(environmentSchema, process.env)
const startedAt = new Date().toISOString()
const observationSystem = createObservationSystem({
  appSessionId: crypto.randomUUID(),
  logDirectory: join(dirname(environment.BOT_TEAMS_DATABASE_PATH), "logs"),
  development: environment.BOT_TEAMS_DEVELOPMENT === "true",
})
let engineState: ProcessState = "starting"
let mainState: ProcessState = "unknown"
let mainShutdown: { timestamp: string; startedAt: number } | undefined

process.on("message", (message) => {
  if (browserMainMessage.safeParse(message).success) {
    return
  }

  const access = engineAccessMessage.safeParse(message)

  if (access.success) {
    server.grant(access.data)

    return
  }

  const forwarded = forwardedObservation.safeParse(message)

  if (!forwarded.success) {
    return
  }

  const input = forwarded.data

  if (input.type === "span") {
    observationSystem.receiver.span(input.span)

    return
  }

  observationSystem.observability.event(input)

  if (input.name === "main.started") {
    mainState = "ready"
  }

  if (input.name === "main.stopped") {
    mainState = "stopping"
    mainShutdown = { timestamp: new Date().toISOString(), startedAt: performance.now() }
  }
})

const piWarmDelayMs = 1_000
const startupStartedAt = performance.now()
const database = openDatabase(environment.BOT_TEAMS_DATABASE_PATH, observationSystem.observability)
const piModels = createPiModels()
const providers = createPiProvider(observationSystem.observability, piModels)
const bots = createBots({
  database,
  observability: observationSystem.observability,
  privateBotsDirectory: environment.BOT_TEAMS_PRIVATE_BOTS_DIRECTORY,
  providers,
  conversations: { close: (botId) => conversations.close(botId), isActive: (botId) => !!conversations.active(botId), setPermissionMode: (botId, mode) => conversations.setPermissionMode(botId, mode) },
})
const projects = createProjects({ database, observability: observationSystem.observability, bots })
const piDirectory = join(dirname(environment.BOT_TEAMS_DATABASE_PATH), "pi")
const loadProvider = environment.BOT_TEAMS_LOAD_PROVIDER === "true"
const deferredPiSessionFactory = deferPiSessionFactory(() =>
  observationSystem.observability.span({ name: "pi.sdkload" }, async () => {
    const { createPiSessionFactory } = await import("./pi/pi-session-adapter")

    return createPiSessionFactory({
      agentDirectory: join(piDirectory, "agent"),
      sessionsDirectory: join(piDirectory, "sessions"),
      models: piModels,
      observability: observationSystem.observability,
    })
  }))
const piSessionFactory = loadProvider ? createPiLoadSessionFactory() : deferredPiSessionFactory
const piRuntime = createPiAgentRuntime(piSessionFactory, observationSystem.observability)
const jev = createJev({ database, secrets: createSecrets(environment.BOT_TEAMS_SECRET_KEY) })
const tasks = createTasks({ database, observability: observationSystem.observability })
const browser = createBrowser({ jev, observability: observationSystem.observability, runtime: piRuntime })
const conversations = createConversations({
  database,
  bots,
  tasks,
  runtime: piRuntime,
  observability: observationSystem.observability,
  extensions: [
    browser,
    { tools: (bot) => routines.tools(bot), instructions: (bot) => routines.instructions(bot) },
    { tools: (bot) => memory.tools(bot), instructions: (bot) => memory.instructions(bot) },
    { tools: (bot) => webSearch.tools(bot), instructions: () => webSearch.instructions() },
    { tools: (bot) => triggers.tools(bot), instructions: (bot) => triggers.instructions(bot) },
    {
      tools: (bot) => plugins.tools(bot),
      instructions: (bot) => plugins.instructions(bot),
      pending: (botId) => plugins.pending(botId),
      inheritance: (leader, references) => plugins.inheritance(leader, references),
    },
  ],
})
const triggers = createTriggers({
  database,
  bots,
  observability: observationSystem.observability,
  conversations: { active: (botId) => conversations.active(botId), callTrigger: (call) => conversations.callTrigger(call) },
})
const github = createGithubAdapter({
  ...(environment.BOT_TEAMS_GITHUB_RELAY_URL ? { relayUrl: environment.BOT_TEAMS_GITHUB_RELAY_URL } : {}),
  observability: observationSystem.observability,
  event: (accountId, event) => triggers.ingest(accountId, event),
})
const plugins = createPlugins({
  database,
  bots,
  observability: observationSystem.observability,
  secrets: createSecrets(environment.BOT_TEAMS_SECRET_KEY),
  adapters: {
    gmail: createGmailAdapter({
      observability: observationSystem.observability,
      ...(environment.BOT_TEAMS_GOOGLE_CLIENT_ID ? { client: { id: environment.BOT_TEAMS_GOOGLE_CLIENT_ID, ...(environment.BOT_TEAMS_GOOGLE_CLIENT_SECRET ? { secret: environment.BOT_TEAMS_GOOGLE_CLIENT_SECRET } : {}) } } : {}),
    }),
    whatsapp: createWhatsappAdapter({ observability: observationSystem.observability, database }),
    github,
    mcp: createMcpAdapter({ observability: observationSystem.observability }),
  },
  conversations: { notify: (botId, event) => conversations.notify(botId, event), addTools: (botId, tools) => piRuntime.addTools(botId, tools) },
})
const webSearch = createWebSearch({ observability: observationSystem.observability })
const routines = createRoutines({ database, bots, observability: observationSystem.observability, conversations: { call: (routine) => conversations.call(routine) } })
const memory = createMemory({
  database,
  bots,
  providers,
  observability: observationSystem.observability,
  sessionFactory: piSessionFactory,
  conversations: { active: (botId) => conversations.active(botId), events: (signal) => conversations.events(signal) },
})
const diagnostics = createDiagnostics({
  source: observationSystem.diagnostics,
  versions: {
    app: environment.BOT_TEAMS_APP_VERSION,
    bun: Bun.version,
    electron: environment.BOT_TEAMS_ELECTRON_VERSION,
  },
  processState: () => ({ engine: engineState, main: mainState }),
  migrationState: database.migrationState,
  exportDirectory: join(dirname(environment.BOT_TEAMS_DATABASE_PATH), "diagnostics"),
  providerState: providers.current,
})
const handler = new RPCHandler(
  createEngineRouter({
    startedAt,
    observability: observationSystem.observability,
    diagnostics,
    receiver: observationSystem.receiver,
    providers,
    bots,
    browser,
    projects,
    jev,
    conversations,
    tasks,
    routines,
    triggers,
    memory,
    permissions: piRuntime,
    plugins,
  }),
)
const server = createEngineServer({
  port: environment.BOT_TEAMS_ENGINE_PORT,
  access: { token: environment.BOT_TEAMS_ENGINE_TOKEN, ...(environment.BOT_TEAMS_ALLOWED_ORIGIN ? { origin: environment.BOT_TEAMS_ALLOWED_ORIGIN } : {}) },
  ...(environment.BOT_TEAMS_RENDERER_DIRECTORY ? { rendererDirectory: environment.BOT_TEAMS_RENDERER_DIRECTORY } : {}),
  handler,
})
engineState = "ready"
plugins.resume()
observationSystem.receiver.span({
  name: "engine.startup",
  timestamp: startedAt,
  durationMs: performance.now() - startupStartedAt,
  outcome: "ok",
  traceId: crypto.randomUUID(),
  spanId: crypto.randomUUID(),
  attributes: { process: "engine", runtime: `Bun ${Bun.version}`, status: "ready" },
})

process.send?.({ type: "ready", port: server.port })

if (!loadProvider) {
  setTimeout(() => {
    deferredPiSessionFactory.warm().catch(() => {})
  }, piWarmDelayMs)
}

let stopping = false

async function drainRequests() {
  const deadline = performance.now() + 5_000

  while (server.pendingRequests > 0 && performance.now() < deadline) {
    await Bun.sleep(25)
  }
}

async function shutdown() {
  if (stopping) {
    return
  }

  stopping = true
  await observationSystem.observability.span(
    { name: "engine.shutdown", attributes: { process: "engine", status: "stopped" } },
    async () => {
      engineState = "stopping"
      void server.stop(false)
      await Promise.all([routines.dispose(), memory.dispose(), triggers.dispose(), conversations.dispose(), plugins.dispose()])
      await drainRequests()
      await server.stop(true).catch(() => {
        process.stderr.write("Bun Engine forced shutdown failed\n")
      })
      database.close()
      engineState = "stopped"

      if (mainShutdown) {
        observationSystem.receiver.span({
          name: "main.shutdown",
          timestamp: mainShutdown.timestamp,
          durationMs: performance.now() - mainShutdown.startedAt,
          outcome: "ok",
          traceId: crypto.randomUUID(),
          spanId: crypto.randomUUID(),
          attributes: { process: "main", status: "stopped" },
        })
        mainState = "stopped"
      }
    },
  ).catch(() => {
    process.stderr.write("Bun Engine shutdown failed\n")
  })
  await observationSystem.observability.flush()
  process.exit(0)
}

process.on("SIGTERM", () => void shutdown())
process.on("disconnect", () => void shutdown())
