import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createPiAgentRuntime, type PiRuntimeEvent, type PiSessionFactory, type PiSessionInput } from "@src/engine/pi/pi-agent-runtime"
import { createProjects } from "@src/engine/projects/projects"
import { createQueue } from "@src/engine/queue"
import { createTasks } from "@src/engine/tasks/tasks"
import type { Bot } from "@src/shared/bots"
import { reportTaskTool } from "@src/shared/tasks"
import { sendMessageTool } from "@src/shared/conversations"

import { must, rejects } from "../support/expect"

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup()
  }
})

function turnDriver(input: PiSessionInput, emit: (event: PiRuntimeEvent) => void) {
  const cancellation = new AbortController()
  let finishOnSteer = false
  const { promise: settled, resolve: settle } = Promise.withResolvers<void>()

  async function tool(name: string, params: Record<string, string>) {
    const selected = input.customTools?.find((candidate) => candidate.name === name)

    if (!selected) {
      throw new Error(`Tool ${name} not found`)
    }

    return selected.execute(params, cancellation.signal)
  }

  return {
    settled,
    input,
    tool,
    finishOnNextSteer() {
      finishOnSteer = true
    },
    async steer() {
      if (finishOnSteer) {
        await tool(reportTaskTool, { status: "done", content: "Investigação entregue" })
        emit({ type: "finished", reason: "stop" })
        settle()
      }
    },
    async finish(content = "Trabalho entregue") {
      const reports = input.tools.includes(reportTaskTool)
      await tool(reports ? reportTaskTool : sendMessageTool, reports ? { content, status: "done" } : { content })
      emit({ type: "finished", reason: "stop" })
      settle()
    },
    stop() {
      emit({ type: "finished", reason: "stop" })
      settle()
    },
    fail(error: string) {
      emit({ type: "finished", reason: "error", error })
      settle()
    },
    abort() {
      cancellation.abort()
      emit({ type: "finished", reason: "aborted" })
      settle()
    },
  }
}

async function teamApp() {
  const directory = await mkdtemp(join(tmpdir(), "mimo-teams-"))
  const { observability } = createObservationSystem({ appSessionId: "teams", logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, "mimo.sqlite"), observability)
  const started = new Map<string, ReturnType<typeof createQueue<ReturnType<typeof turnDriver>>>>()

  function turns(botId: string) {
    const existing = started.get(botId)

    if (existing) {
      return existing
    }

    const queue = createQueue<ReturnType<typeof turnDriver>>({ onClose() {} })
    started.set(botId, queue)

    return queue
  }

  const factory: PiSessionFactory = {
    async open(input) {
      const listeners = new Set<(event: PiRuntimeEvent) => void>()
      const emit = (event: PiRuntimeEvent) => {
        for (const listener of listeners) {
          listener(event)
        }
      }
      let current: ReturnType<typeof turnDriver> | undefined

      return {
        async prompt() {
          current = turnDriver(input, emit)
          emit({ type: "started" })
          turns(input.botId).push(current)
          await current.settled
        },
        async steer() { await current?.steer() },
        async compact() { return { tokensBefore: 0 } },
        async abort() { current?.abort() },
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() { listeners.clear() },
      }
    },
  }
  const runtime = createPiAgentRuntime(factory, observability)
  const tasks = createTasks({ database, observability })
  const bots = createBots({
    database,
    observability,
    privateBotsDirectory: join(directory, "bots"),
    providers: { async models() { return [{ provider: "codex", name: "Codex", default: "gpt-5.6-luna", models: [{ id: "gpt-5.6-luna", name: "Luna" }, { id: "gpt-5.6-sol", name: "Sol" }] }] }, async list() { return [{ provider: "codex", name: "Codex", connection: "subscription", status: "available", connected: true, detectedKey: false }] } },
    conversations: { close: async (id) => conversations.close(id), isActive: (id) => !!conversations.active(id), setPermissionMode: (id, mode) => conversations.setPermissionMode(id, mode) },
  })
  const conversations = createConversations({ database, bots, tasks, runtime, observability, extensions: [] })
  const projects = createProjects({ database, observability, bots })
  cleanups.push(async () => {
    await conversations.dispose()
    await observability.flush()
    database.close()

    for (const queue of started.values()) {
      queue.close()
    }

    await rm(directory, { recursive: true, force: true })
  })

  async function next(bot: Pick<Bot, "id">) {
    const result = await turns(bot.id)[Symbol.asyncIterator]().next()

    if (!result.value) {
      throw new Error("No turn started")
    }

    return result.value
  }

  return {
    directory,
    database,
    bots,
    tasks,
    conversations,
    projects,
    next,
    async start(bot: Pick<Bot, "id">) {
      await conversations.send({ botId: bot.id, content: "Prepare o trabalho", images: [], replyTo: null, mentionedBotIds: [], deliver: "queue" })

      return next(bot)
    },
  }
}

test("mover de Projeto leva o time junto, solta o Integrante que muda sozinho, e editar ou excluir o Projeto preserva os Bots", async () => {
  const app = await teamApp()
  const editorial = await app.projects.create({ name: "Editorial", defaultWorkingDirectory: app.directory })
  const vendas = await app.projects.create({ name: "Vendas" })
  const leader = await app.bots.create({ name: "Editora", projectId: editorial.id })
  const member = await app.bots.create({ name: "Pesquisador", leaderBotId: leader.id, function: { outcome: "Reunir fontes" } })
  const loner = await app.bots.create({ name: "Revisor" })

  expect(app.bots.updateProject({ id: leader.id, projectId: vendas.id }).projectId).toBe(vendas.id)
  expect(app.bots.get(member.id)?.projectId).toBe(vendas.id)
  expect(app.projects.list().projects.map((project) => project.bots.map((bot) => bot.id))).toEqual([[], [leader.id]])

  expect(app.bots.updateProject({ id: member.id, projectId: editorial.id })).toMatchObject({ projectId: editorial.id, leaderBotId: null })
  expect(app.bots.updateProject({ id: loner.id, projectId: null }).projectId).toBeNull()
  expect(() => app.bots.updateProject({ id: loner.id, projectId: "inexistente" })).toThrow("Project not found")

  expect(await app.projects.update({ id: vendas.id, name: "Comercial", defaultWorkingDirectory: app.directory })).toEqual({ ...vendas, name: "Comercial", defaultWorkingDirectory: app.directory })
  expect(app.bots.get(leader.id)?.effectiveWorkingDirectory).toBe(app.directory)
  await rejects(app.projects.update({ id: "inexistente", name: "Nada", defaultWorkingDirectory: null }), "Projeto não encontrado")

  app.projects.remove(vendas.id)
  expect(app.projects.list().projects.map((project) => project.id)).toEqual([editorial.id])
  expect(app.bots.get(leader.id)).toMatchObject({ projectId: null, effectiveWorkingDirectory: join(app.directory, "bots", leader.id) })
  expect(app.projects.list().unassignedBots.map((bot) => bot.id)).toEqual([leader.id, loner.id])
  expect(() => app.projects.remove(vendas.id)).toThrow("Projeto não encontrado")
})

test("desvincular preserva o Bot e seus dados, permite novo vínculo e protege da exclusão do antigo Líder", async () => {
  const app = await teamApp()
  const project = await app.projects.create({ name: "Editorial", defaultWorkingDirectory: app.directory })
  const leader = await app.bots.create({ name: "Editora", projectId: project.id })
  const member = await app.bots.create({ name: "Pesquisador", leaderBotId: leader.id, function: { outcome: "Reunir fontes" } })
  const colleague = await app.bots.create({ name: "Revisor" })
  app.bots.addColleague(member.id, colleague.id)
  const before = app.bots.get(member.id)

  if (!before) {
    throw new Error("Integrante não foi criado")
  }

  const memory = { id: "memory", botId: member.id, content: "Prefere fontes primárias", origin: "person", sourceMessageId: null, supersededAt: null, supersededByMessageId: null, curationVersion: 1, createdAt: new Date().toISOString() } as const
  app.database.memories.create(memory)
  app.database.accounts.create({ id: "account", pluginId: "gmail", label: "Editorial", state: "connected", secret: null, tools: [], checkedAt: new Date().toISOString() })
  app.database.accesses.set({ botId: member.id, accountId: "account" })
  const file = join(await app.bots.directory(member.id), "fontes.txt")
  await writeFile(file, "Fontes preservadas")
  const turn = await app.start(member)
  await turn.finish()
  const history = app.conversations.history({ botId: member.id, limit: 100 })

  expect(app.bots.detachMember(member.id)).toEqual({ ...before, leaderBotId: null })
  expect(app.bots.detachMember(member.id).leaderBotId).toBeNull()
  expect(app.projects.list().projects[0]?.bots.map((bot) => bot.id)).toEqual([leader.id, member.id])
  expect(app.database.memories.get(memory.id)).toEqual(memory)
  expect(app.database.accesses.listForBot(member.id)).toEqual([{ botId: member.id, accountId: "account" }])
  expect(app.conversations.history({ botId: member.id, limit: 100 })).toEqual(history)
  expect(await Bun.file(file).text()).toBe("Fontes preservadas")

  app.bots.addMember({ leaderBotId: leader.id, botId: member.id })
  expect(app.bots.get(member.id)?.leaderBotId).toBe(leader.id)
  app.bots.detachMember(member.id)
  await app.bots.remove(leader.id)
  expect(app.bots.get(member.id)?.leaderBotId).toBeNull()
  expect(await Bun.file(file).text()).toBe("Fontes preservadas")
})

test.each(["member", "leader", "task", "temporary"])("não desvincula com impedimento %s e preserva o vínculo", async (blocked) => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const member = blocked === "temporary"
    ? await app.bots.hire(leader, { name: "Temporário", permanent: false, function: { outcome: "Pesquisar" } })
    : await app.bots.create({ name: "Integrante", leaderBotId: leader.id })

  if (blocked === "member" || blocked === "leader") {
    await app.start(blocked === "member" ? member : leader)
  }

  if (blocked === "task") {
    app.tasks.create({ callerBotId: leader.id, assigneeBotId: member.id })
  }

  expect(() => app.bots.detachMember(member.id)).toThrow(blocked === "temporary" ? "temporários" : "Aguarde")
  expect(app.bots.get(member.id)?.leaderBotId).toBe(leader.id)
})

test("interromper o time com Líder livre cancela integrantes e Colegas relacionados, preserva a Fila e outros trabalhos", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const member = await app.bots.create({ name: "Integrante", leaderBotId: leader.id })
  const colleague = await app.bots.create({ name: "Colega" })
  const unrelated = await app.bots.create({ name: "Outro trabalho" })
  app.bots.addColleague(member.id, colleague.id)
  const leaderTurn = await app.start(leader)
  await leaderTurn.tool("delegate", { bot: member.id, instructions: "Pesquisar", wait: "no" })
  const memberTurn = await app.next(member)
  await memberTurn.tool("delegate", { bot: colleague.id, instructions: "Revisar", wait: "no" })
  await app.next(colleague)
  await leaderTurn.finish("O time está trabalhando")
  await app.start(unrelated)
  await app.conversations.send({ botId: member.id, content: "Próximo trabalho", images: [], replyTo: null, mentionedBotIds: [], deliver: "queue" })

  await app.conversations.abortTeam(leader.id)

  for (const bot of [leader, member, colleague]) {
    expect(app.conversations.active(bot.id)).toBeUndefined()
  }

  expect(app.conversations.active(unrelated.id)?.author).toBe("person")
  expect(app.tasks.listForBot(member.id).map((task) => task.status)).toEqual(["interrupted", "interrupted"])
  expect(app.conversations.history({ botId: leader.id, limit: 100 }).messages.filter((message) => message.authorBotId === member.id)).toEqual([])
  const events = app.conversations.events()[Symbol.asyncIterator]()
  await events.next()
  expect((await events.next()).value).toMatchObject({ botId: member.id, event: { type: "queue-changed", queued: [{ content: "Próximo trabalho" }] } })
  await events.return?.()
  await app.conversations.abortTeam(leader.id)
  const resumed = await app.start(leader)
  await resumed.finish("Novo trabalho permitido")
})

test("cancelar uma delegação que aguarda um Colega ocupado não interrompe o trabalho independente dele", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const colleague = await app.bots.create({ name: "Colega ocupado" })
  app.bots.addColleague(leader.id, colleague.id)
  const colleagueTurn = await app.start(colleague)
  const leaderTurn = await app.start(leader)
  await leaderTurn.tool("delegate", { bot: colleague.id, instructions: "Aguardar", wait: "no" })

  await app.conversations.abortTeam(leader.id)
  expect(app.tasks.listForBot(leader.id)[0]?.status).toBe("interrupted")
  expect(app.conversations.active(colleague.id)?.author).toBe("person")
  await colleagueTurn.finish("Pedido independente entregue")
  expect(app.conversations.history({ botId: colleague.id, limit: 100 }).messages.some((message) => message.authorBotId === leader.id)).toBe(false)
  expect(app.conversations.active(leader.id)).toBeUndefined()
})

test("interromper o time descarta um retorno concluído que ainda espera o Líder", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const member = await app.bots.create({ name: "Integrante", leaderBotId: leader.id })
  const leaderTurn = await app.start(leader)
  await leaderTurn.tool("delegate", { bot: member.id, instructions: "Pesquisar", wait: "no" })
  const memberTurn = await app.next(member)
  await memberTurn.finish("Fontes reunidas")

  await app.conversations.abortTeam(leader.id)

  expect(app.tasks.listForBot(leader.id)[0]?.status).toBe("done")
  expect(app.conversations.active(leader.id)).toBeUndefined()
  expect(app.conversations.history({ botId: leader.id, limit: 100 }).messages.some((message) => message.authorBotId === member.id)).toBe(false)
})

test("interromper somente o Líder preserva sua delegação sem espera", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const member = await app.bots.create({ name: "Integrante", leaderBotId: leader.id })
  const leaderTurn = await app.start(leader)
  await leaderTurn.tool("delegate", { bot: member.id, instructions: "Pesquisar", wait: "no" })
  const memberTurn = await app.next(member)
  await app.conversations.abort(leader.id)
  expect(app.conversations.active(member.id)).toBeDefined()
  await memberTurn.finish("Resultado recebido")
  const result = await app.next(leader)
  await result.finish("Entrega consolidada")
  expect(app.tasks.listForBot(leader.id)[0]?.status).toBe("done")
})

test("pergunta à pessoa libera a espera do Líder e o integrante entrega uma única vez depois", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const member = await app.bots.create({ name: "Pesquisa", leaderBotId: leader.id })
  const caller = await app.start(leader)
  const waiting = caller.tool("delegate", { bot: member.id, instructions: "Investigue", wait: "yes" })
  const worker = await app.next(member)
  await app.conversations.send({ botId: leader.id, content: "Posso mudar a permissão dele? Só responda", images: [], replyTo: null, mentionedBotIds: [], deliver: "queue" })
  expect(app.conversations.history({ botId: leader.id, limit: 100 }).messages.at(-1)?.content).toBe("Posso mudar a permissão dele? Só responda")
  expect(await waiting).toContain("will reply later")
  expect(app.conversations.active(member.id)).toBeDefined()
  await caller.finish("Pode, a alteração vale imediatamente.")
  expect(app.conversations.active(leader.id)).toBeUndefined()
  expect(app.conversations.teamWorking(leader.id)).toBe(true)
  await worker.finish("Causa confirmada")
  const returning = await app.next(leader)
  await returning.finish("A investigação terminou.")
  const deliveries = app.conversations.history({ botId: leader.id, limit: 100 }).messages.filter((message) => message.authorBotId === member.id)
  expect(deliveries.map((message) => message.content)).toEqual(["Causa confirmada"])
  expect(app.tasks.listForBot(member.id)).toMatchObject([{ status: "done" }])
})

test.each(["leader", "team"])("interromper %s depois de liberar a espera mantém o alcance do cancelamento", async (scope) => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const member = await app.bots.create({ name: "Pesquisa", leaderBotId: leader.id })
  const caller = await app.start(leader)
  const waiting = caller.tool("delegate", { bot: member.id, instructions: "Investigue", wait: "yes" })
  const worker = await app.next(member)
  await app.conversations.send({ botId: leader.id, content: "Como funciona?", images: [], replyTo: null, mentionedBotIds: [], deliver: "queue" })
  await waiting

  if (scope === "team") {
    await app.conversations.abortTeam(leader.id)
    expect(app.conversations.active(member.id)).toBeUndefined()
    expect(app.tasks.listForBot(member.id)).toMatchObject([{ status: "interrupted" }])
  } else {
    await app.conversations.abort(leader.id)
    expect(app.conversations.active(member.id)).toBeDefined()
    await worker.finish("Resultado preservado")
    const returning = await app.next(leader)
    await returning.finish()
    expect(app.tasks.listForBot(member.id)).toMatchObject([{ status: "done" }])
  }
})

test("cancelamento alcança trabalho descendente mesmo depois que o Colega já entregou seu retorno", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const colleague = await app.bots.create({ name: "Colega" })
  app.bots.addColleague(leader.id, colleague.id)
  const leaderTurn = await app.start(leader)
  await leaderTurn.tool("delegate", { bot: colleague.id, instructions: "Pesquisar", wait: "no" })
  const colleagueTurn = await app.next(colleague)
  await colleagueTurn.tool("hire", { name: "Fontes", role: "Pesquisar", permanent: "no", instructions: "Pesquisar", wait: "no" })
  const temporary = app.bots.list().find((bot) => bot.temporary)

  if (!temporary) {
    throw new Error("Temporário não foi contratado")
  }

  await app.next(temporary)
  await leaderTurn.finish()
  await colleagueTurn.finish("Entreguei a primeira parte")
  const returned = await app.next(leader)
  await returned.finish()
  expect(app.conversations.teamWorking(leader.id)).toBe(true)
  await app.start(leader)

  await app.conversations.abortTeam(leader.id)

  expect(app.conversations.active(temporary.id)).toBeUndefined()
  expect(app.tasks.listForBot(temporary.id)[0]?.status).toBe("interrupted")
  expect(app.bots.get(temporary.id)?.closed).toBe(true)
  expect(app.conversations.active(colleague.id)).toBeUndefined()
  expect(app.conversations.teamWorking(leader.id)).toBe(false)
})

test("transferência respeita trabalho ativo e cancelamento alcança o novo responsável", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const member = await app.bots.create({ name: "Integrante", leaderBotId: leader.id })
  const recipient = await app.bots.create({ name: "Revisor", leaderBotId: leader.id })
  const otherLeader = await app.bots.create({ name: "Outro Líder" })
  const leaderTurn = await app.start(leader)
  const delegated = leaderTurn.tool("delegate", { bot: member.id, instructions: "Pesquisar", wait: "yes" })
  const memberTurn = await app.next(member)
  expect(() => app.bots.addMember({ leaderBotId: otherLeader.id, botId: member.id })).toThrow("Aguarde")
  const transferred = memberTurn.tool("transfer", { bot: recipient.id, instructions: "Revisar" })
  await app.next(recipient)

  await app.conversations.abortTeam(leader.id)
  await Promise.all([delegated, transferred])

  expect(app.tasks.listForBot(leader.id)[0]).toMatchObject({ assigneeBotId: recipient.id, status: "interrupted" })
  expect(app.conversations.active(recipient.id)).toBeUndefined()
  expect(app.conversations.active(member.id)).toBeUndefined()
  expect(app.conversations.active(leader.id)).toBeUndefined()
})

test("excluir Líder apaga permanentes e temporários encerrados, seus históricos e Diretórios privados", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const permanent = await app.bots.create({ name: "Integrante", leaderBotId: leader.id })
  const leaderTurn = await app.start(leader)
  await leaderTurn.tool("hire", { name: "Pesquisa pontual", role: "Pesquisar", permanent: "no", instructions: "Pesquisar", wait: "no" })
  const temporary = app.bots.list().find((bot) => bot.temporary)

  if (!temporary) {
    throw new Error("Temporário não foi contratado")
  }

  const memberTurn = await app.next(temporary)
  await leaderTurn.finish()
  await memberTurn.finish()
  const returned = await app.next(leader)
  await returned.finish()
  expect(app.bots.get(temporary.id)?.closed).toBe(true)
  expect(app.projects.list().unassignedBots[0]?.members.map((bot) => bot.id)).toEqual([permanent.id, temporary.id])
  const file = join(await app.bots.directory(temporary.id), "resultado.txt")
  await writeFile(file, "Resultado")

  await app.bots.remove(leader.id)

  expect(app.bots.list()).toEqual([])
  expect(app.database.conversations.history(temporary.id, { limit: 100 }).messages).toEqual([])
  expect(await Bun.file(file).exists()).toBe(false)
})

test("excluir um Líder com delegação sem espera não reabre sua conversa nem deixa Turnos órfãos", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const member = await app.bots.create({ name: "Integrante", leaderBotId: leader.id })
  const leaderTurn = await app.start(leader)
  await leaderTurn.tool("delegate", { bot: member.id, instructions: "Pesquisar", wait: "no" })
  await app.next(member)
  await leaderTurn.finish()

  await app.bots.remove(leader.id)

  expect(app.bots.list()).toEqual([])
  expect(app.conversations.active(leader.id)).toBeUndefined()
  expect(app.conversations.active(member.id)).toBeUndefined()
})


test.each([false, true])("contratação aplica modelo, esforço e pasta antes de iniciar e respeita herança de permissão %s", async (inheritMemberPermissions) => {
  const app = await teamApp()
  const created = await app.bots.create({ name: "Projects Manager" })
  const leader = await app.bots.update({ ...created, model: "gpt-5.6-sol", effort: "high", permissionMode: "full", inheritMemberPermissions })
  const turn = await app.start(leader)
  const cwd = join(app.directory, "worktree")
  await mkdir(cwd)
  const result = await turn.tool("hire", { name: "Investigação", role: "Investigar", permanent: "no", instructions: "Investigue", wait: "no", model: "gpt-5.6-sol", effort: "low", cwd, permissionMode: "full" })
  const member = must(app.bots.list().find((bot) => bot.name === "Investigação"))

  const first = await app.next(member)
  expect(first.input).toMatchObject({ provider: "codex", model: "gpt-5.6-sol", effort: "low", cwd, policy: { mode: "full", allowedRoot: cwd } })
  expect(result).toContain(cwd)
  expect(result).toContain("gpt-5.6-sol")
  await turn.tool("hire", { name: "Herdado", role: "Pesquisar", permanent: "yes", instructions: "Pesquise", wait: "no" })
  const inherited = must(app.bots.list().find((bot) => bot.name === "Herdado"))

  expect((await app.next(inherited)).input).toMatchObject({ model: "gpt-5.6-sol", effort: "high", cwd: leader.effectiveWorkingDirectory, policy: { mode: inheritMemberPermissions ? "full" : "ask" } })
})

test.each([
  ["model", "inexistente"],
  ["cwd", "/mimo-directory-that-does-not-exist"],
  ["effort", "invalid"],
  ["permissionMode", "full"],
])("contratação inválida %s=%s não cria Bot nem Tarefa", async (field, value) => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const turn = await app.start(leader)
  await rejects(turn.tool("hire", { name: "Inválido", role: "Investigar", permanent: "no", instructions: "Investigue", wait: "no", [field]: value }))
  expect(app.bots.list().map((bot) => bot.id)).toEqual([leader.id])
  expect(app.tasks.listForBot(leader.id)).toEqual([])
})

test("configurar libera a aprovação atual e retomar preserva Bot, Tarefa e histórico com os novos ajustes", async () => {
  const app = await teamApp()
  const created = await app.bots.create({ name: "Líder" })
  const leader = app.bots.updateExecution({ id: created.id, setting: "permissionMode", value: "full" })
  const turn = await app.start(leader)
  await turn.tool("hire", { name: "Investigador", role: "Investigar", permanent: "no", instructions: "Investigue", wait: "no" })
  const member = must(app.bots.list().find((bot) => bot.name === "Investigador"))

  const first = await app.next(member)
  const task = must(app.tasks.listForBot(member.id)[0])
  if (first.input.policy.mode !== "ask") {
    throw new Error("Expected a permission request")
  }
  const approval = first.input.policy.request({ id: "pending", tool: "bash", detail: "pwd" })
  const cwd = join(app.directory, "worktree")
  await mkdir(cwd)
  await turn.tool("configure_member", { bot: member.id, model: "gpt-5.6-sol", effort: "low", cwd, permissionMode: "full" })
  expect(await approval).toBe("allowed")
  expect(first.input).toMatchObject({ model: "gpt-5.6-luna", policy: { mode: "full" } })
  expect(app.conversations.active(member.id)?.taskId).toBe(task.id)
  await app.conversations.abort(member.id)
  await turn.finish()
  const returning = await app.next(leader)
  const history = app.conversations.history({ botId: leader.id, limit: 100 }).messages
  expect(history.at(-1)?.content).toContain("was stopped")
  expect(history.at(-1)?.content).not.toContain("direct order")
  await returning.tool("delegate", { bot: member.id, instructions: "Continue a investigação", wait: "no" })
  const resumed = await app.next(member)
  expect(resumed.input).toMatchObject({ model: "gpt-5.6-sol", effort: "low", cwd, policy: { mode: "full" } })
  expect(app.tasks.listForBot(member.id)).toMatchObject([{ id: task.id, status: "working" }])
  expect(app.conversations.history({ botId: member.id, limit: 100 }).messages.filter((message) => message.authorBotId === leader.id).map((message) => message.content)).toEqual(["Investigue", "Continue a investigação"])
  await resumed.finish()
  await returning.finish()
  const completed = await app.next(leader)
  await completed.tool("delegate", { bot: member.id, instructions: "Valide o resultado", wait: "no" })
  const validation = await app.next(member)
  expect(validation.input).toMatchObject({ model: "gpt-5.6-sol", effort: "low", cwd, policy: { mode: "full" } })
  expect(app.tasks.listForBot(member.id)).toMatchObject([{ id: task.id, status: "done" }, { status: "working" }])
  expect(app.conversations.history({ botId: member.id, limit: 100 }).messages.at(-1)?.content).toBe("Valide o resultado")
})

test("Líder não configura Colegas nem integrantes de outro Time", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const other = await app.bots.create({ name: "Outro Líder" })
  const member = await app.bots.create({ name: "Integrante", leaderBotId: other.id })
  app.bots.addColleague(leader.id, other.id)
  const turn = await app.start(leader)
  for (const target of [other, member]) {
    await rejects(turn.tool("configure_member", { bot: target.id, effort: "low" }))
    await rejects(app.bots.configureMember(leader.id, target.id, { effort: "low" }), "own team")
    expect(app.bots.get(target.id)?.effort).toBe("medium")
  }
})


test.each([false, true])("/novo impede retorno da delegação antiga, inclusive se já concluída: %s", async (completed) => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "Líder" })
  const member = await app.bots.create({ name: "Integrante", leaderBotId: leader.id })
  const leaderTurn = await app.start(leader)
  await leaderTurn.tool("delegate", { bot: member.id, instructions: "Pesquisar", wait: "no" })
  const memberTurn = await app.next(member)

  if (completed) {
    await memberTurn.finish("Resultado antigo")
  }

  await app.conversations.newSession(leader.id)

  expect(app.tasks.listForBot(leader.id)[0]?.status).toBe(completed ? "done" : "interrupted")
  expect(app.conversations.active(leader.id)).toBeUndefined()
  expect(app.conversations.active(member.id)).toBeUndefined()
  expect(app.conversations.history({ botId: leader.id, limit: 100 }).messages.some((message) => message.authorBotId === member.id)).toBe(false)
  const fresh = await app.start(leader)
  expect(fresh.input.sessionFile).toBeUndefined()
  await fresh.finish("Nova sessão")
})

test("orientações do Líder e da pessoa complementam a Tarefa e somente a entrega volta", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "PM" })
  const caller = await app.start(leader)
  await caller.tool("hire", { name: "Cadastro", role: "Investigar", permanent: "no", instructions: "Investigue", wait: "no" })
  const member = must(app.bots.list().find((bot) => bot.temporary))
  const worker = await app.next(member)
  const task = must(app.tasks.latest(member.id))
  await worker.tool(sendMessageTool, { content: "Hipótese inicial: cache" })
  await caller.tool("delegate", { bot: member.id, instructions: "Use staging", wait: "no" })
  await app.conversations.send({ botId: member.id, content: "Confira recuperação", images: [], replyTo: null, mentionedBotIds: [], deliver: "now" })
  expect(app.tasks.listForBot(member.id)).toMatchObject([{ id: task.id, status: "working" }])
  expect(app.conversations.history({ botId: member.id, limit: 100 }).messages.slice(-2).map((message) => ({ content: message.content, taskId: message.taskId, author: message.author }))).toEqual([
    { content: "Use staging", taskId: task.id, author: "bot" },
    { content: "Confira recuperação", taskId: task.id, author: "person" },
  ])
  await caller.finish()
  await worker.finish("Validação concluída: recuperação comprovada")
  const returning = await app.next(leader)
  await returning.finish()
  expect(app.conversations.history({ botId: leader.id, limit: 100 }).messages.filter((message) => message.authorBotId === member.id).map((message) => message.content)).toEqual(["Validação concluída: recuperação comprovada"])
})

test("bloqueio pede resposta ao Líder e retoma a mesma Tarefa", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "PM" })
  const member = await app.bots.create({ name: "Investigador", leaderBotId: leader.id })
  const caller = await app.start(leader)
  await caller.tool("delegate", { bot: member.id, instructions: "Investigue", wait: "no" })
  const worker = await app.next(member)
  const task = must(app.tasks.latest(member.id))
  expect(worker.input.tools).not.toContain("ask")
  await worker.tool(reportTaskTool, { status: "blocked", content: "Qual ambiente devo consultar?" })
  await caller.finish()
  worker.stop()
  const returning = await app.next(leader)
  expect(app.tasks.get(task.id)).toMatchObject({ status: "blocked", finishedAt: null })
  expect(app.conversations.history({ botId: leader.id, limit: 100 }).messages.at(-1)?.content).toContain("Qual ambiente")
  await returning.tool("delegate", { bot: member.id, instructions: "Staging", wait: "no" })
  const continued = await app.next(member)
  expect(app.tasks.listForBot(member.id)).toMatchObject([{ id: task.id, status: "working" }])
  await continued.finish("Consultei staging")
})

test("Fila no temporário continua vinculada e entrega os dois resultados ao Líder", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "PM" })
  const caller = await app.start(leader)
  await caller.tool("hire", { name: "Cadastro", role: "Investigar", permanent: "no", instructions: "Investigue", wait: "no" })
  const member = must(app.bots.list().find((bot) => bot.temporary))
  const worker = await app.next(member)
  await app.conversations.send({ botId: member.id, content: "Agora valide", images: [], replyTo: null, mentionedBotIds: [], deliver: "queue" })
  await caller.finish()
  await worker.finish("Investigação entregue")
  const returning = await app.next(leader)
  const validation = await app.next(member)
  expect(app.conversations.active(member.id)?.taskId).toBe(app.tasks.latest(member.id)?.id)
  expect(app.bots.get(member.id)?.closed).toBe(false)
  await returning.finish()
  await validation.finish("Validação entregue")
  await app.next(leader)
  expect(app.tasks.listForBot(member.id).map((task) => task.status)).toEqual(["done", "done"])
  expect(app.conversations.history({ botId: leader.id, limit: 100 }).messages.filter((message) => message.authorBotId === member.id).map((message) => message.content)).toEqual(["Investigação entregue", "Validação entregue"])
})

test.each(["error", "missing-report", "report-then-error"])("retorno %s preserva falha e progresso sem anunciar sucesso", async (kind) => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "PM" })
  const member = await app.bots.create({ name: "Investigador", leaderBotId: leader.id })
  const caller = await app.start(leader)
  await caller.tool("delegate", { bot: member.id, instructions: "Investigue", wait: "no" })
  const worker = await app.next(member)
  await worker.tool(sendMessageTool, { content: "Achei falha no carregamento" })
  if (kind === "report-then-error") {
    await worker.tool(reportTaskTool, { status: "done", content: "Resultado ainda não consolidado" })
  }
  await caller.finish()
  if (kind === "missing-report") {
    worker.stop()
  } else {
    worker.fail("HTTP 429: limite do fornecedor")
  }
  await app.next(leader)
  expect(app.tasks.latest(member.id)?.status).toBe("failed")
  const result = app.conversations.history({ botId: leader.id, limit: 100 }).messages.at(-1)?.content
  expect(result).toContain(kind === "missing-report" ? "report_task" : "HTTP 429")
  expect(result).toContain(kind === "report-then-error" ? "Resultado ainda não consolidado" : "Achei falha no carregamento")
  expect(result).toContain("partial")
})


test("orientação enquanto Colega aguarda disponibilidade não duplica a execução", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "PM" })
  const colleague = await app.bots.create({ name: "Pesquisador" })
  app.bots.addColleague(leader.id, colleague.id)
  const independent = await app.start(colleague)
  const caller = await app.start(leader)
  await caller.tool("delegate", { bot: colleague.id, instructions: "Investigue", wait: "no" })
  await caller.tool("delegate", { bot: colleague.id, instructions: "Inclua staging", wait: "no" })
  await caller.finish()
  await independent.finish("Pedido independente concluído")
  const worker = await app.next(colleague)
  const events = app.conversations.events()[Symbol.asyncIterator]()
  while (true) {
    const next = await events.next()
    if (next.value?.botId === colleague.id && next.value.event.type === "message-finished" && next.value.event.message?.content === "Inclua staging") {
      break
    }
    if (app.conversations.history({ botId: colleague.id, limit: 100 }).messages.at(-1)?.content === "Inclua staging") {
      break
    }
  }
  await events.return?.()
  await worker.finish("Resultado com staging")
  await app.next(leader)
  expect(app.tasks.listForBot(colleague.id)).toHaveLength(1)
  expect(app.conversations.active(colleague.id)).toBeUndefined()
  expect(app.conversations.history({ botId: leader.id, limit: 100 }).messages.filter((message) => message.authorBotId === colleague.id).map((message) => message.content)).toEqual(["Resultado com staging"])
})


test("orientação na transição da entrega vira continuação sem perda ou duplicação", async () => {
  const app = await teamApp()
  const leader = await app.bots.create({ name: "PM" })
  const caller = await app.start(leader)
  await caller.tool("hire", { name: "Cadastro", role: "Investigar", permanent: "no", instructions: "Investigue", wait: "no" })
  const member = must(app.bots.list().find((bot) => bot.temporary))
  const worker = await app.next(member)
  worker.finishOnNextSteer()
  await caller.tool("delegate", { bot: member.id, instructions: "Agora valide", wait: "no" })
  const validation = await app.next(member)
  expect(app.tasks.listForBot(member.id).map((task) => task.status)).toEqual(["done", "working"])
  expect(app.conversations.history({ botId: member.id, limit: 100 }).messages.filter((message) => message.content === "Agora valide")).toHaveLength(1)
  await caller.finish()
  const firstResult = await app.next(leader)
  await firstResult.finish()
  await validation.finish("Validação entregue")
  await app.next(leader)
  expect(app.conversations.history({ botId: leader.id, limit: 100 }).messages.filter((message) => message.authorBotId === member.id).map((message) => message.content)).toEqual(["Investigação entregue", "Validação entregue"])
})
