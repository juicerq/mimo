import { botsStore, type BotRoute } from "./bots-store"

const routeNames = new Set(["chat", "details", "settings", "members", "routines", "triggers", "memory", "archive"])
const storageKey = "mimo.last-conversation"

function readRoute(params: URLSearchParams): BotRoute {
  const page = params.get("page")

  if (page === "routine" || page === "trigger") {
    const id = params.get("id")

    if (id) {
      return { name: page, id }
    }
  }

  if (page === "members" && params.get("create") === "true") {
    return { name: "members", create: true }
  }

  if (page && routeNames.has(page)) {
    return { name: page as Exclude<BotRoute["name"], "routine" | "trigger"> }
  }

  return { name: "chat" }
}

export function subscribeWorkspaceNavigation() {
  let restoring = false

  function restore() {
    const params = new URLSearchParams(location.search)
    const selectedBotId = params.get("bot")
    const screen = params.get("screen")
    restoring = true
    botsStore.setState((state) => ({ ...state, browserSidebarOpen: false, mobileMenuOpen: false, selectedBotId, mobileList: params.get("view") === "bots" || (!selectedBotId && !screen), botRoute: readRoute(params), draft: screen === "create-bot" ? state.draft ?? { avatarSeed: null, name: "" } : null, dialog: null, screen: screen === "plugins" || screen === "settings" ? screen : null }))
    restoring = false
  }

  if (!location.search) {
    const saved = localStorage.getItem(storageKey)

    if (saved) {
      history.replaceState(null, "", `${location.pathname}?bot=${encodeURIComponent(saved)}`)
    }
  }

  if (!location.search) {
    history.replaceState(null, "", `${location.pathname}?view=bots`)
  }

  restore()
  window.addEventListener("popstate", restore)
  botsStore.subscribe(() => {
    if (restoring) {
      return
    }

    const { selectedBotId, mobileList, botRoute, screen, draft } = botsStore.state
    const params = new URLSearchParams()

    if (selectedBotId) {
      if (!mobileList) {
        params.set("bot", selectedBotId)
      }

      localStorage.setItem(storageKey, selectedBotId)
    }

    if (mobileList) {
      params.set("view", "bots")
    }

    if (botRoute.name !== "chat") {
      params.set("page", botRoute.name)
    }

    if (botRoute.name === "members" && botRoute.create) {
      params.set("create", "true")
    }

    if ("id" in botRoute) {
      params.set("id", botRoute.id)
    }

    if (screen) {
      params.set("screen", screen)
    }

    if (draft) {
      params.set("screen", "create-bot")
    }

    const url = `${location.pathname}?${params}`

    if (url !== location.pathname + location.search) {
      if (history.state?.mimoPrevious === url) {
        history.back()
        return
      }

      history.pushState({ mimoPrevious: location.pathname + location.search }, "", url)
    }
  })
}
