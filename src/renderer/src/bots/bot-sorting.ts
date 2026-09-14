import type { BotDrop, useBotDrop } from "./bot-drop"
import { flushSync } from "react-dom"
import { animateBotPlacement } from "./bot-motion"

interface SortRow {
  element: HTMLElement
  button: HTMLButtonElement
  id: string
  top: number
  height: number
}

interface Drag {
  row: SortRow
  rows: SortRow[]
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  scrollTop: number
  active: boolean
  target: number
  frame: number
}

function projectPreviewDestination(drop: BotDrop | null, list: HTMLUListElement) {
  if (drop?.kind !== "project") {
    return { target: null, before: null }
  }

  const destination = drop.target?.querySelector<HTMLElement>(".sortable-bots") ?? drop.target

  if (!destination || destination === list) {
    return { target: null, before: null }
  }

  const before = [...destination.children].find((row) => row.querySelector<HTMLElement>("button[data-bot-id]")?.dataset.botId === drop.beforeBotId) ?? null

  return { target: destination, before }
}

function projectPreviewPositions(elements: Set<Element>, source: HTMLElement) {
  return [...elements].flatMap((element) => {
    if (!(element instanceof HTMLElement) || !element.querySelector("button[data-bot-id]") || element === source) {
      return []
    }

    return [{ element, bounds: element.getBoundingClientRect() }]
  })
}

export function bindBotSorting(list: HTMLUListElement, commit: (ids: string[], name: string, position: number) => void, getDrop: () => ReturnType<typeof useBotDrop>) {
  const scroller = list.closest("nav") ?? list
  const listeners = new AbortController()
  const options = { signal: listeners.signal }
  let drag: Drag | null = null
  let suppressClick = false
  let drop: BotDrop | null = null
  let dropSince = 0
  let hint: HTMLDivElement | null = null
  let preview: HTMLElement | null = null
  let placeholder: HTMLElement | null = null

  function rows() {
    const measured = [...list.children].flatMap((element) => {
      const button = element.querySelector<HTMLButtonElement>("button[data-bot-id]")

      if (!(element instanceof HTMLElement) || !button?.dataset.botId) {
        return []
      }

      return [{ element, button, id: button.dataset.botId, top: element.offsetTop, height: element.getBoundingClientRect().height }]
    })

    return measured.map((row, index) => ({ ...row, height: (measured[index + 1]?.top ?? list.scrollHeight) - row.top }))
  }

  function reset() {
    if (!drag) {
      return
    }

    cancelAnimationFrame(drag.frame)
    list.classList.remove("is-sorting")
    scroller.classList.remove("is-dragging")
    list.closest("[data-project-drop]")?.classList.remove("bot-drop-source")
    drop?.target?.classList.remove("bot-drop-target")
    hint?.remove()
    hint = null
    preview?.remove()
    preview = null
    drop = null
    updateProjectPreview(drag)
    drag.rows.forEach(({ element }) => {
      element.style.removeProperty("transform")
      element.classList.remove("bot-lifted", "bot-making-room")
    })
    drag = null
  }

  function finish(cancelled: boolean) {
    const current = drag

    if (!current) {
      return
    }

    const destination = drop && dropReady() ? drop : null
    const before = new Map(current.rows.map(({ id, element }) => [id, element.getBoundingClientRect()]))

    if (preview) {
      before.set(current.row.id, preview.getBoundingClientRect())
    }
    const next = current.rows.filter((row) => row !== current.row)
    next.splice(current.target, 0, current.row)
    reset()

    if (!current.active) {
      return
    }

    suppressClick = current.pointerId !== -1

    if (list.hasPointerCapture(current.pointerId)) {
      list.releasePointerCapture(current.pointerId)
    }

    if (!cancelled && destination) {
      getDrop()?.apply({ ...destination, origin: before.get(current.row.id) })
    } else if (!cancelled) {
      flushSync(() => commit(next.map((row) => row.id), current.row.button.querySelector("strong")?.textContent ?? "Bot", current.target + 1))
    }

    current.rows.forEach(({ id, element }) => {
      const from = before.get(id)

      if (from) {
        animateBotPlacement(element, from, id === current.row.id)
      }
    })
  }

  function dropReady() {
    return !!drop?.target?.hasAttribute("data-bot-team") || !!drop?.target?.hasAttribute("data-project-drop") || performance.now() - dropSince >= 450
  }

  function resolveDrop(current: Drag, hit: Element | null) {
    if (!hit || !scroller.contains(hit)) {
      return null
    }

    return getDrop()?.resolve({
      botId: current.row.id,
      button: hit.closest<HTMLElement>("button[data-bot-id]"),
      team: hit.closest<HTMLElement>("[data-bot-team]"),
      project: hit.closest<HTMLElement>("[data-project-drop]"),
      x: current.x,
      y: current.y,
    }) ?? null
  }

  function updateDrop(current: Drag, hit: Element | null) {
    const candidate = resolveDrop(current, hit)

    if (candidate?.label !== drop?.label || candidate?.target !== drop?.target) {
      drop?.target?.classList.remove("bot-drop-target")
      dropSince = performance.now()
    }

    drop = candidate

    if (drop) {
      hint ??= document.body.appendChild(document.createElement("div"))
      hint.className = "bot-drop-hint"
      hint.textContent = drop.label
      hint.style.left = `${Math.max(8, Math.min(current.x + 16, window.innerWidth - hint.offsetWidth - 8))}px`
      hint.style.top = `${Math.max(8, Math.min(current.y + 20, window.innerHeight - hint.offsetHeight - 8))}px`
      drop.target?.classList.toggle("bot-drop-target", dropReady())
      hint.dataset.ready = String(dropReady())
    } else {
      hint?.remove()
      hint = null
    }

  }

  function updateProjectPreview(current: Drag) {
    const { target, before } = projectPreviewDestination(drop, list)

    if ((!target && !placeholder) || (target && placeholder?.parentElement === target && placeholder.nextElementSibling === before)) {
      return
    }

    const affected = new Set([...placeholder?.parentElement?.children ?? [], ...target?.children ?? []])
    const positions = projectPreviewPositions(affected, current.row.element)

    positions.forEach(({ element }) => element.getAnimations().forEach((animation) => animation.cancel()))
    placeholder?.remove()
    placeholder = null

    if (target) {
      // Reserve the landing slot without moving React's Bot rows between lists.
      placeholder = document.createElement(target.tagName === "UL" ? "li" : "div")
      placeholder.setAttribute("aria-hidden", "true")
      placeholder.style.height = `${current.row.height}px`
      placeholder.style.pointerEvents = "none"
      target.insertBefore(placeholder, before)
    }

    positions.forEach(({ element, bounds }) => animateBotPlacement(element, bounds, false))
  }

  function paint() {
    const current = drag

    if (!current?.active) {
      return
    }

    if (current.rows.some((row) => !row.element.isConnected) || list.children.length !== current.rows.length) {
      finish(true)

      return
    }

    const hit = document.elementFromPoint(current.x, current.y)
    updateDrop(current, hit)
    updateProjectPreview(current)

    const bounds = scroller.getBoundingClientRect()
    const edge = 36
    if (current.y > bounds.bottom - edge) {
      scroller.scrollTop += Math.min(12, current.y - (bounds.bottom - edge))
    } else if (current.y < bounds.top + edge) {
      scroller.scrollTop += Math.max(-12, current.y - (bounds.top + edge))
    }

    const dy = current.y - current.startY + scroller.scrollTop - current.scrollTop
    const center = current.row.top + current.row.height / 2 + dy
    const others = current.rows.filter((row) => row !== current.row)
    if ((!drop || !dropReady()) && hit?.closest(".sortable-bots") === list) {
      current.target = others.filter((row) => center > row.top + row.height / 2).length
    }

    if (preview) {
      const left = Number.parseFloat(preview.style.left)
      const top = Number.parseFloat(preview.style.top)
      const dx = Math.max(8 - left, Math.min(window.innerWidth - preview.offsetWidth - left - 8, current.x - current.startX))
      const dy = Math.max(8 - top, Math.min(window.innerHeight - preview.offsetHeight - top - 8, current.y - current.startY))
      preview.style.transform = `translate(${dx}px, ${dy}px)`
    }
    const next = [...others]

    if (drop?.kind !== "project") {
      next.splice(current.target, 0, current.row)
    } else {
      current.row.element.style.removeProperty("transform")
    }

    let top = current.rows[0].top

    next.forEach((row) => {
      if (row === current.row) {
        row.element.style.transform = `translate(${Math.max(-14, Math.min(14, current.x - current.startX))}px, ${dy}px)`
      } else {
        row.element.style.transform = `translateY(${top - row.top}px)`
        row.element.classList.toggle("bot-making-room", top !== row.top)
      }

      top += row.height
    })
    current.frame = requestAnimationFrame(paint)
  }

  list.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary || drag) {
      return
    }

    const button = event.target instanceof Element ? event.target.closest("button[data-bot-id]") : null
    const siblings = rows()
    const row = siblings.find((row) => row.button === button)

    if (!row || button?.closest(".sortable-bots") !== list) {
      return
    }

    // Touch starts on the face so vertical swipes on the rest of the row still scroll.
    if (event.pointerType === "touch" && !(event.target instanceof Element && event.target.closest(".bot-face"))) {
      return
    }

    event.stopPropagation()
    suppressClick = false
    drag = { row, rows: siblings, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, scrollTop: scroller.scrollTop, active: false, target: siblings.indexOf(row), frame: 0 }
  }, options)

  window.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return
    }

    drag.x = event.clientX
    drag.y = event.clientY

    if (drag.active || Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 6) {
      return
    }

    drag.active = true
    drag.rows.forEach(({ element }) => element.getAnimations().forEach((animation) => animation.cancel()))
    list.setPointerCapture(event.pointerId)
    list.classList.add("is-sorting")
    scroller.classList.add("is-dragging")
    list.closest("[data-project-drop]")?.classList.add("bot-drop-source")
    drag.row.element.classList.add("bot-lifted")
    const previewOrigin = drag.row.button.getBoundingClientRect()
    preview = document.createElement("div")
    preview.className = "bot-drag-preview"
    preview.inert = true
    preview.setAttribute("aria-hidden", "true")
    preview.style.left = `${previewOrigin.left}px`
    preview.style.top = `${previewOrigin.top}px`
    preview.style.width = `${previewOrigin.width}px`
    preview.appendChild(drag.row.button.cloneNode(true))
    preview.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"))
    preview.querySelectorAll("[popover]").forEach((element) => element.remove())
    document.body.appendChild(preview)
    paint()
  }, options)
  window.addEventListener("pointerup", (event) => {
    if (drag?.pointerId === event.pointerId) {
      drag.x = event.clientX
      drag.y = event.clientY
      cancelAnimationFrame(drag.frame)
      paint()

      const bounds = scroller.getBoundingClientRect()
      finish(event.clientX < bounds.left - 24 || event.clientX > bounds.right + 24 || event.clientY < bounds.top - 24 || event.clientY > bounds.bottom + 24)
    }
  }, options)
  window.addEventListener("pointercancel", (event) => {
    if (drag?.pointerId === event.pointerId) {
      finish(true)
    }
  }, options)
  window.addEventListener("blur", () => finish(true), options)
  list.addEventListener("lostpointercapture", () => finish(true), options)
  list.addEventListener("click", (event) => {
    if (suppressClick) {
      event.preventDefault()
      event.stopImmediatePropagation()
      suppressClick = false
    }
  }, { ...options, capture: true })
  list.addEventListener("contextmenu", (event) => {
    if (drag?.active) {
      event.preventDefault()
      event.stopPropagation()
      finish(true)
    }
  }, options)
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drag) {
      event.preventDefault()
      finish(true)
    }
  }, options)
  list.addEventListener("keydown", (event) => {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) {
      return
    }

    const siblings = rows()
    const index = siblings.findIndex((row) => row.button === event.target)
    const target = index + (event.key === "ArrowUp" ? -1 : 1)

    if (index < 0 || target < 0 || target >= siblings.length) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    drag = { row: siblings[index], rows: siblings, pointerId: -1, startX: 0, startY: 0, x: 0, y: 0, scrollTop: scroller.scrollTop, active: true, target, frame: 0 }
    finish(false)
    siblings[index].button.focus()
  }, options)

  return () => {
    reset()
    listeners.abort()
  }
}
