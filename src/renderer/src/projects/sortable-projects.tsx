import { useSelector } from "@tanstack/react-store"
import { type ReactNode, useCallback, useState } from "react"
import { botOrderStore, orderedBots, saveBotOrder } from "../bots/bot-order"
import { bindBotSorting } from "../bots/bot-sorting"

// Project sections share the persisted sidebar ordering with their Bot lists.
const projectOrderGroup = "$projects"

export function SortableProjects<T extends { id: string }>({ items, children }: { items: T[]; children: (project: T) => ReactNode }) {
  const order = useSelector(botOrderStore, (state) => state[projectOrderGroup])
  const [notice, setNotice] = useState("")
  const attach = useCallback((list: HTMLDivElement | null) => {
    if (!list) {
      return
    }

    return bindBotSorting(list, (next, name, position) => {
      const saved = saveBotOrder(projectOrderGroup, next)
      setNotice(saved ? `${name} na posição ${position} de ${next.length}.` : "Ordem alterada nesta sessão, mas não foi possível salvá-la no dispositivo.")
    }, () => null, "project")
  }, [])

  return <>
    <div ref={attach} className="sortable-projects">{orderedBots(items, order).map(children)}</div>
    <span className="sr-only" role="status">{notice}</span>
  </>
}

export function ProjectSortHandle({ id, name }: { id: string; name: string }) {
  return <button type="button" className="project-sort-handle" data-project-sort-id={id} aria-label={`Reordenar ${name}`} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown">{name}</button>
}
