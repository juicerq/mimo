import { Store } from "@tanstack/react-store"
import type { ProviderModels, ProviderName } from "@src/shared/providers"

const storageKey = "mimo.model-favorites.v1"

function loadFavorites(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]")

    if (Array.isArray(saved) && saved.every((key: unknown) => typeof key === "string")) {
      return saved
    }
  } catch {
    // Device storage may be unavailable; favorites still work for this session.
  }

  return []
}

export const modelFavoritesStore = new Store({ keys: loadFavorites(), saved: true })

export function toggleModelFavorite(provider: ProviderName, model: string) {
  const key = JSON.stringify([provider, model])
  const current = modelFavoritesStore.state.keys
  const keys = current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]

  saveFavorites(keys)
}

function saveFavorites(keys: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(keys))
    modelFavoritesStore.setState(() => ({ keys, saved: true }))
  } catch {
    modelFavoritesStore.setState(() => ({ keys, saved: false }))
  }
}

export function moveModelFavorite(key: string, target: string, before: boolean) {
  const current = modelFavoritesStore.state.keys

  if (key === target || !current.includes(key) || !current.includes(target)) {
    return
  }

  const keys = current.filter((entry) => entry !== key)
  keys.splice(keys.indexOf(target) + Number(!before), 0, key)
  saveFavorites(keys)
}

export function favoriteModelOptions(catalogs: ProviderModels[], favorites: string[], query: string) {
  const term = query.trim().toLowerCase()
  const positions = new Map(favorites.map((key, index) => [key, index]))

  return catalogs.flatMap((catalog) => catalog.models.map((model) => {
    const key = JSON.stringify([catalog.provider, model.id])
    const favorite = positions.has(key)

    return { ...model, key, provider: catalog.provider, providerName: catalog.name, standard: model.id === catalog.default, favorite, group: favorite ? "Favoritos" : catalog.name }
  }))
    .filter((model) => `${model.name} ${model.id} ${model.providerName}`.toLowerCase().includes(term))
    .sort((a, b) => (positions.get(a.key) ?? favorites.length) - (positions.get(b.key) ?? favorites.length))
}
