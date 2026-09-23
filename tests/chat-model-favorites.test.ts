import { afterEach, expect, test } from "bun:test"
import { favoriteModelOptions, modelFavoritesStore, moveModelFavorite, toggleModelFavorite } from "@src/renderer/src/chat/chat-model-favorites"
import type { ProviderModels } from "@src/shared/providers"

const initial = modelFavoritesStore.state
const catalogs: ProviderModels[] = [
  { provider: "codex", name: "ChatGPT", default: "shared", models: [{ id: "shared", name: "Shared" }, { id: "fast", name: "Fast" }] },
  { provider: "opencode", name: "OpenCode", default: "shared", models: [{ id: "shared", name: "Shared" }, { id: "deep", name: "Deep" }] },
]

afterEach(() => modelFavoritesStore.setState(() => initial))

test("favorites lead the catalog without duplicating models or mixing provider identities", () => {
  modelFavoritesStore.setState(() => ({ keys: [], saved: true }))
  toggleModelFavorite("opencode", "shared")
  const options = favoriteModelOptions(catalogs, modelFavoritesStore.state.keys, "")

  expect(options.map((model) => [model.provider, model.id, model.favorite])).toEqual([
    ["opencode", "shared", true],
    ["codex", "shared", false],
    ["codex", "fast", false],
    ["opencode", "deep", false],
  ])
  expect(options[0].standard).toBe(true)
  expect(catalogs[0].models.map((model) => model.id)).toEqual(["shared", "fast"])

  toggleModelFavorite("opencode", "shared")
  expect(favoriteModelOptions(catalogs, modelFavoritesStore.state.keys, "").map((model) => model.provider)).toEqual(["codex", "codex", "opencode", "opencode"])
})

test("search filters favorites too and matches provider names as well as model names", () => {
  modelFavoritesStore.setState(() => ({ keys: [], saved: true }))
  toggleModelFavorite("opencode", "deep")

  expect(favoriteModelOptions(catalogs, modelFavoritesStore.state.keys, "  CHATGPT  ").map((model) => model.id)).toEqual(["shared", "fast"])
  expect(favoriteModelOptions(catalogs, modelFavoritesStore.state.keys, "Deep").map((model) => model.id)).toEqual(["deep"])
  expect(favoriteModelOptions(catalogs, modelFavoritesStore.state.keys, "missing")).toEqual([])
})

test("unavailable favorites stay remembered and return first when the provider reconnects", () => {
  modelFavoritesStore.setState(() => ({ keys: [], saved: true }))
  toggleModelFavorite("opencode", "deep")

  expect(favoriteModelOptions(catalogs.slice(0, 1), modelFavoritesStore.state.keys, "").every((model) => !model.favorite)).toBe(true)
  expect(favoriteModelOptions(catalogs, modelFavoritesStore.state.keys, "")[0].id).toBe("deep")
})

test("unavailable device storage keeps favorites usable for the session and exposes the failure", () => {
  modelFavoritesStore.setState(() => ({ keys: [], saved: true }))
  toggleModelFavorite("codex", "fast")

  expect(modelFavoritesStore.state.saved).toBe(false)
  expect(favoriteModelOptions(catalogs, modelFavoritesStore.state.keys, "")[0].id).toBe("fast")
})


test("dragging favorites saves their order across providers without dropping hidden favorites", () => {
  modelFavoritesStore.setState(() => ({ keys: [], saved: true }))
  toggleModelFavorite("codex", "fast")
  toggleModelFavorite("opencode", "shared")
  toggleModelFavorite("opencode", "deep")
  const [fast, shared, deep] = modelFavoritesStore.state.keys

  moveModelFavorite(deep, fast, true)
  expect(favoriteModelOptions(catalogs, modelFavoritesStore.state.keys, "").slice(0, 3).map((model) => model.id)).toEqual(["deep", "fast", "shared"])

  // A filtered view hides Deep; moving the visible models preserves it.
  moveModelFavorite(fast, shared, false)
  expect(modelFavoritesStore.state.keys).toEqual([deep, shared, fast])
  expect(favoriteModelOptions(catalogs, modelFavoritesStore.state.keys, "OpenCode").map((model) => model.id)).toEqual(["deep", "shared"])

  moveModelFavorite(shared, shared, true)
  moveModelFavorite("unavailable", fast, true)
  expect(modelFavoritesStore.state.keys).toEqual([deep, shared, fast])
})
