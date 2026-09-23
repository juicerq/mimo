import { type ButtonHTMLAttributes, type PointerEvent, useState } from "react"
import { moveModelFavorite } from "./chat-model-favorites"

function dropTarget(event: PointerEvent<HTMLButtonElement>) {
  const list = event.currentTarget.closest("[data-model-options]")
  const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-favorite-key]")
  const key = row?.dataset.favoriteKey

  if (!row || !key || !list?.contains(row)) {
    return null
  }

  const bounds = row.getBoundingClientRect()

  return { key, before: event.clientY < bounds.top + bounds.height / 2 }
}

export function useModelFavoriteSorting(keys: string[]) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [target, setTarget] = useState<ReturnType<typeof dropTarget>>(null)
  const [notice, setNotice] = useState("")

  function reset() {
    setDragging(null)
    setTarget(null)
  }

  function handleProps(key: string) {
    return {
      "aria-keyshortcuts": "Alt+ArrowUp Alt+ArrowDown",
      onPointerDown(event) {
        if (event.button !== 0 || !event.isPrimary) {
          return
        }

        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(key)
      },
      onPointerMove(event) {
        if (!dragging || !event.currentTarget.hasPointerCapture(event.pointerId)) {
          return
        }

        const next = dropTarget(event)
        setTarget(next?.key === key ? null : next)
        const list = event.currentTarget.closest("[data-model-options]")

        if (list) {
          const bounds = list.getBoundingClientRect()

          if (event.clientY < bounds.top + 24) {
            list.scrollTop -= 12
          } else if (event.clientY > bounds.bottom - 24) {
            list.scrollTop += 12
          }
        }
      },
      onPointerUp(event) {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          return
        }

        const next = dropTarget(event)

        if (dragging && next && next.key !== key) {
          moveModelFavorite(key, next.key, next.before)
          setNotice("Ordem dos favoritos atualizada.")
        }

        event.currentTarget.releasePointerCapture(event.pointerId)
        reset()
      },
      onLostPointerCapture: reset,
      onPointerCancel: reset,
      onKeyDown(event) {
        if (event.key === "Escape") {
          reset()

          return
        }

        if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) {
          return
        }

        event.preventDefault()
        const before = event.key === "ArrowUp"
        const next = keys[keys.indexOf(key) + (before ? -1 : 1)]

        if (next) {
          moveModelFavorite(key, next, before)
          setNotice("Ordem dos favoritos atualizada.")
        }
      },
    } satisfies ButtonHTMLAttributes<HTMLButtonElement>
  }

  return { dragging, target, notice, handleProps }
}
