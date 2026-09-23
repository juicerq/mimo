// Electron of its own for bench/jev-isolated.ts: a random debugging port, a temporary profile and the fixture site, never Mimo Dev's data.
import { app, BrowserWindow, View } from "electron"
import { createServer } from "node:http"
import { createInterface } from "node:readline"
import { readFile, symlink } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { BrowserPage } from "@src/main/browser/browser-page"
import { browserCommand } from "@src/shared/browser"
import { browserDebuggingPort } from "@src/main/browser/browser-debugging"

const directory = z.string().parse(process.argv.at(-2))
const repository = z.string().parse(process.argv.at(-1))
app.setPath("userData", directory)
app.setPath("home", directory)
await symlink(join(repository, "node_modules"), join(directory, "node_modules"), "dir")
app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1")
app.commandLine.appendSwitch("remote-debugging-port", await browserDebuggingPort(0))
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows")

const message = z.discriminatedUnion("action", [
  z.object({ id: z.string(), action: z.literal("execute"), input: browserCommand }),
  z.object({ id: z.string(), action: z.literal("goto"), url: z.string() }),
  z.object({ id: z.string(), action: z.literal("evaluate"), expression: z.string() }),
  z.object({ id: z.string(), action: z.literal("stop") }),
])

void app.whenReady().then(async () => {
  const html = await readFile(join(repository, "tests/fixtures/jev-site.html"))
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    response.end(html)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()

  if (!address || typeof address === "string") {
    throw new Error("No fixture site")
  }

  const window = new BrowserWindow({ show: true, width: 1280, height: 860, title: "Mimo: avaliação isolada do Jev" })
  const page = new BrowserPage({ window, cover: new View() }, { botId: "isolated", botName: "isolated" }, () => {})
  page.show({ x: 0, y: 0, width: 1280, height: 800 })

  createInterface({ input: process.stdin }).on("line", (raw) => {
    const request = message.parse(JSON.parse(raw))
    void (async () => {
      if (request.action === "stop") {
        server.close()
        app.quit()
        return "stopped"
      }

      if (request.action === "goto") {
        await page.view.webContents.loadURL(request.url)
        return "loaded"
      }

      if (request.action === "evaluate") {
        return JSON.stringify(await page.view.webContents.executeJavaScript(request.expression))
      }

      return await page.execute(request.input, new AbortController().signal)
    })().then((result) => process.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`), (error: Error) => process.stdout.write(`${JSON.stringify({ id: request.id, error: error.message })}\n`))
  })
  process.stdin.on("end", () => app.quit())
  process.stdout.write(`${JSON.stringify({ id: "ready", result: `http://127.0.0.1:${address.port}/` })}\n`)
}).catch((error: Error) => {
  console.error(error)
  app.exit(1)
})
