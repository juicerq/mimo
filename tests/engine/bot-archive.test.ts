import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createBotArchive } from "@src/engine/bots/bot-archive"
import { createBots, newBot } from "@src/engine/bots/bots"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { rejects } from "../support/expect"

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) { await cleanup() }
})

async function archiveApp() {
  const directory = await mkdtemp(join(tmpdir(), "mimo-archive-"))
  const { observability } = createObservationSystem({ appSessionId: "archive", logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, "mimo.sqlite"), observability)
  cleanups.push(async () => {
    await observability.flush()
    database.close()
    await rm(directory, { recursive: true, force: true })
  })
  const bots = createBots({ database, observability, privateBotsDirectory: join(directory, "bots"), providers: { async list() { return [] }, async models() { return [] } }, conversations: { async close() {}, isActive: () => false, setPermissionMode() {} } })
  const bot = database.bots.create(newBot({ name: "Criador", provider: "codex", function: { outcome: "Criar arquivos" }, leaderBotId: null, projectId: null, workingDirectoryOverride: directory }))
  const root = await bots.directory(bot.id)

  return { archive: createBotArchive(bots), botId: bot.id, root, directory }
}

test("Acervo separa pastas de arquivos, ordena cada grupo pelo nome e navega por subpastas", async () => {
  const { archive, botId, root } = await archiveApp()
  await mkdir(join(root, "Entregas #1"))
  await mkdir(join(root, "Entrega 10"))
  await mkdir(join(root, "Entrega 2"))
  await writeFile(join(root, ".instruções"), "oculto")
  await writeFile(join(root, "arquivo 10.md"), "dez")
  await writeFile(join(root, "arquivo 2.md"), "dois")
  await writeFile(join(root, "Entregas #1", "olá mundo.txt"), "Conteúdo do Bot")
  const list = await archive.list({ botId, path: "" })
  expect(list.directory).toBe(root)
  expect(list.entries.map(({ name, kind }) => ({ name, kind }))).toEqual([
    { name: "Entrega 2", kind: "directory" },
    { name: "Entrega 10", kind: "directory" },
    { name: "Entregas #1", kind: "directory" },
    { name: ".instruções", kind: "file" },
    { name: "arquivo 2.md", kind: "file" },
    { name: "arquivo 10.md", kind: "file" },
  ])
  const nested = await archive.list({ botId, path: "Entregas #1" })
  expect(nested.entries[0]?.path).toBe("Entregas #1/olá mundo.txt")
  expect(await archive.preview({ botId, path: "Entregas #1/olá mundo.txt" })).toEqual({ kind: "text", content: "Conteúdo do Bot" })
  await mkdir(join(root, "vazia"))
  expect((await archive.list({ botId, path: "vazia" })).entries).toEqual([])
})

test("prévia preserva texto e HTML como conteúdo e transporta PNG sem alteração", async () => {
  const { archive, botId, root } = await archiveApp()
  const html = '<html><script>window.example = true</script><h1>Olá</h1></html>'
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII="
  await writeFile(join(root, "página.html"), html)
  await writeFile(join(root, "imagem.png"), Buffer.from(png, "base64"))
  await writeFile(join(root, "vazio.txt"), "")
  expect(await archive.preview({ botId, path: "página.html" })).toEqual({ kind: "text", content: html })
  expect(await archive.preview({ botId, path: "imagem.png" })).toEqual({ kind: "image", content: `data:image/png;base64,${png}` })
  expect(await archive.preview({ botId, path: "vazio.txt" })).toEqual({ kind: "text", content: "" })
})

test("binários e arquivos grandes continuam listados sem carregar uma prévia ilimitada", async () => {
  const { archive, botId, root } = await archiveApp()
  await writeFile(join(root, "dados.bin"), Buffer.from([0, 1, 2, 255]))
  await writeFile(join(root, "grande.txt"), Buffer.alloc(2 * 1024 * 1024, "a"))
  expect((await archive.list({ botId, path: "" })).entries).toHaveLength(2)
  expect((await archive.preview({ botId, path: "dados.bin" })).kind).toBe("unsupported")
  expect((await archive.preview({ botId, path: "grande.txt" })).kind).toBe("unsupported")
})

test("Acervo impede caminhos e links externos, mantém links internos e informa links quebrados", async () => {
  const { archive, botId, root, directory } = await archiveApp()
  await writeFile(join(directory, "segredo.txt"), "fora")
  await writeFile(join(root, "texto.txt"), "dentro")
  await symlink(join(directory, "segredo.txt"), join(root, "externo"))
  await symlink(join(root, "texto.txt"), join(root, "interno"))
  await symlink(join(root, "ausente"), join(root, "quebrado"))
  const list = await archive.list({ botId, path: "" })
  expect(list.entries.find((entry) => entry.name === "externo")?.kind).toBe("unavailable")
  expect(list.entries.find((entry) => entry.name === "quebrado")?.kind).toBe("unavailable")
  expect(await archive.preview({ botId, path: "interno" })).toEqual({ kind: "text", content: "dentro" })
  await rejects(archive.preview({ botId, path: "externo" }), "fora do Acervo")
  await rejects(archive.list({ botId, path: "../" }), "fora do Acervo")
  await rejects(archive.preview({ botId, path: join(directory, "segredo.txt") }), "fora do Acervo")
  await rejects(archive.list({ botId: "inexistente", path: "" }), "Bot not found")
})

test("pastas ligadas mantêm o caminho da árvore ao expandir e abrir seus arquivos", async () => {
  const { archive, botId, root } = await archiveApp()
  await mkdir(join(root, "originais", "imagens"), { recursive: true })
  await writeFile(join(root, "originais", "imagens", "notas.md"), "# Notas")
  await symlink(join(root, "originais"), join(root, "atalho"))

  const linked = await archive.list({ botId, path: "atalho" })
  expect(linked.entries[0]?.path).toBe("atalho/imagens")
  const nested = await archive.list({ botId, path: "atalho/imagens" })
  expect(nested.entries[0]?.path).toBe("atalho/imagens/notas.md")
  expect(await archive.preview({ botId, path: "atalho/imagens/notas.md" })).toEqual({ kind: "text", content: "# Notas" })
  expect((await archive.list({ botId, path: "originais/imagens" })).entries[0]?.path).toBe("originais/imagens/notas.md")
})

test("PDF, áudio e vídeo são transportados para os visualizadores com tipo e limite", async () => {
  const { archive, botId, root } = await archiveApp()

  for (const [name, kind, mime] of [["arquivo.pdf", "pdf", "application/pdf"], ["audio.wav", "audio", "audio/wav"], ["video.webm", "video", "video/webm"]] as const) {
    await writeFile(join(root, name), Buffer.from([0, 1, 2, 255]))
    expect(await archive.preview({ botId, path: name })).toEqual({ kind, content: `data:${mime};base64,AAEC/w==` })
    await truncate(join(root, name), 17 * 1024 * 1024)
    expect((await archive.preview({ botId, path: name })).kind).toBe("unsupported")
  }
})
