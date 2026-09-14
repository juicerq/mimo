import { createContext, type ReactNode, useContext, useState, useRef } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ProjectGroups } from "@src/shared/projects"
import type { EngineClient } from "../engine-client"
import { animateBotPlacement } from "./bot-motion"
import { botOrderStore, orderedBots, saveBotOrder } from "./bot-order"
import { teamLeaders } from "./team"

interface BotDropBase {
  botId: string
  label: string
  target: HTMLElement | null
  origin?: Pick<DOMRect, "left" | "top">
}

export type BotDrop = BotDropBase & (
  | { kind: "team"; leaderBotId: string }
  | { kind: "detach" }
  | { kind: "project"; projectId: string | null; beforeBotId: string | null }
)

interface DropPoint {
  botId: string
  button: HTMLElement | null
  x: number
  y: number
  team: HTMLElement | null
  project: HTMLElement | null
}

/** The "Sem projeto" section carries an empty `data-project-drop`. */
export const unassignedProjectDrop = ""

const BotDropContext = createContext<{
  resolve: (point: DropPoint) => BotDrop | null
  apply: (drop: BotDrop) => void
} | null>(null)

export function useBotDrop() {
  return useContext(BotDropContext)
}

export function BotDropProvider({ client, data, children }: { client: EngineClient; data: ProjectGroups | undefined; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState("")
  const leaders = teamLeaders(data)
  const bots = leaders.flatMap((bot) => [bot, ...bot.members])
  const { mutate, isPending, isError } = useMutation({
    async mutationFn(drop: BotDrop) {
      if (drop.kind === "team") {
        return await client.raw.bots.addMember({ botId: drop.botId, leaderBotId: drop.leaderBotId })
      }

      if (drop.kind === "project") {
        return await client.raw.bots.updateProject({ id: drop.botId, projectId: drop.projectId })
      }

      return await client.raw.bots.detachMember({ id: drop.botId })
    },
    async onSuccess(bot, drop) {
      const before = new Map([...container.current?.querySelectorAll<HTMLElement>("[data-bot-id]") ?? []].map((element) => [element.dataset.botId, element.getBoundingClientRect()]))

      setNotice(describeLanding(bot.name, drop))

      if (drop.kind === "project") {
        const group = drop.projectId ?? "unassigned"
        const siblings = orderedBots(leaders.filter((leader) => leader.projectId === drop.projectId && leader.id !== bot.id), botOrderStore.state[group]).map((leader) => leader.id)
        const index = siblings.findIndex((id) => id === drop.beforeBotId)
        siblings.splice(index < 0 ? siblings.length : index, 0, bot.id)

        if (!saveBotOrder(group, siblings)) {
          setNotice(`${describeLanding(bot.name, drop)} A ordem foi alterada nesta sessão, mas não foi possível salvá-la no dispositivo.`)
        }
      }

      await queryClient.invalidateQueries({ queryKey: client.query.projects.key() })
      requestAnimationFrame(() => {
        const buttons = [...container.current?.querySelectorAll<HTMLElement>("[data-bot-id]") ?? []]
        const visible = buttons.some((element) => element.dataset.botId === bot.id && element.getBoundingClientRect().height > 0 && !element.closest("[inert]"))

        buttons.forEach((element) => {
          const landed = element.dataset.botId === bot.id
          const from = landed ? drop.origin : before.get(element.dataset.botId)

          if (from) {
            animateBotPlacement(element, from, landed || (!visible && element.dataset.botId === bot.leaderBotId))
          }
        })
      })
    },
    onError(error) {
      setNotice(`Não foi possível mover o Bot: ${error.message}`)
    },
  })

  function describeLanding(name: string, drop: BotDrop) {
    if (drop.kind === "team") {
      return `${name} adicionado ao time.`
    }

    if (drop.kind === "detach") {
      return `${name} agora é independente.`
    }

    const project = data?.projects.find((project) => project.id === drop.projectId)

    if (!project) {
      return `${name} agora está sem projeto.`
    }

    return `${name} movido para ${project.name}.`
  }

  function resolve(point: DropPoint): BotDrop | null {
    const bot = bots.find((bot) => bot.id === point.botId)

    if (!bot || bot.temporary || isPending) {
      return null
    }

    return resolveTarget(bot, point)
  }

  function resolveTarget(bot: (typeof bots)[number], { botId, button, x, y, team, project }: DropPoint): BotDrop | null {
    if (project && project.dataset.projectDrop !== (bot.projectId ?? unassignedProjectDrop)) {
      return intoProject(bot, project, y)
    }

    const targetId = team?.dataset.botTeam ?? button?.dataset.botId
    const target = bots.find((bot) => bot.id === targetId)
    const center = !!team || isRowCenter(button, x, y)
    const leadsTeam = leaders.some((leader) => leader.id === botId && leader.members.length > 0)

    if (target && center && !leadsTeam) {
      return intoTeam(bot, target, team ?? button)
    }

    if (project && bot.leaderBotId && !team) {
      return intoProject(bot, project, y)
    }

    return leaveTeam(bot, target, team, button)
  }

  // Leaving a team keeps the project, matching the existing detach action.
  function leaveTeam(bot: (typeof bots)[number], target: (typeof bots)[number] | undefined, team: HTMLElement | null, button: HTMLElement | null): BotDrop | null {
    if (!bot.leaderBotId || team) {
      return null
    }

    if (target && (target.leaderBotId || target.projectId !== bot.projectId)) {
      return null
    }

    return { kind: "detach", botId: bot.id, label: "Tornar independente", target: button }
  }

  function intoTeam(bot: (typeof bots)[number], target: (typeof bots)[number], element: HTMLElement | null): BotDrop | null {
    const leader = bots.find((bot) => bot.id === (target.leaderBotId ?? target.id))

    if (!leader || leader.temporary || leader.id === bot.id || leader.id === bot.leaderBotId) {
      return null
    }

    return { kind: "team", botId: bot.id, leaderBotId: leader.id, label: `Entrar no time de ${leader.name}`, target: element }
  }

  function intoProject(bot: (typeof bots)[number], element: HTMLElement, y: number): BotDrop | null {
    const projectId = element.dataset.projectDrop
    const project = data?.projects.find((project) => project.id === projectId)

    if (projectId !== unassignedProjectDrop && !project) {
      return null
    }

    const destination = project ? `Mover para ${project.name}` : "Deixar sem projeto"
    const list = element.querySelector<HTMLElement>(".sortable-bots")
    const before = list && [...list.children].find((row) => {
      const button = row.querySelector<HTMLElement>("button[data-bot-id]")

      if (!(row instanceof HTMLElement) || !button?.dataset.botId || button.dataset.botId === bot.id || row.offsetHeight === 0) {
        return false
      }

      // Layout coordinates include the landing slot but ignore the reordering animation.
      return y < list.getBoundingClientRect().top + row.offsetTop + row.offsetHeight / 2
    })?.querySelector<HTMLElement>("button[data-bot-id]")
    const position = before ? `antes de ${before.querySelector("strong")?.textContent ?? "Bot"}` : "no final"
    const label = `${destination}${bot.leaderBotId ? " e sair do time" : ""}, ${position}`

    return { kind: "project", botId: bot.id, projectId: project?.id ?? null, beforeBotId: before?.dataset.botId ?? null, label, target: element }
  }

  return <BotDropContext value={{ resolve, apply: (drop) => { setNotice("Movendo Bot…"); mutate(drop) } }}>
    <div ref={container} className="contents">{children}</div>
    {notice && <p className={`bot-drop-notice ${isError ? "text-status-error" : "text-secondary"}`} role={isError ? "alert" : "status"}>
      {notice}<button type="button" className="ml-3 bg-transparent text-secondary" aria-label="Fechar aviso" onClick={() => setNotice("")}>×</button>
    </p>}
  </BotDropContext>
}

function isRowCenter(button: HTMLElement | null, x: number, y: number) {
  if (!button) {
    return false
  }

  const bounds = button.getBoundingClientRect()

  return y > bounds.top + bounds.height * .25 && y < bounds.bottom - bounds.height * .25 && x > bounds.left + 20
}
