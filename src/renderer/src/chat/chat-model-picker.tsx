import { Bars2Icon, CheckIcon, MagnifyingGlassIcon, StarIcon } from "@heroicons/react/24/outline"
import { useSelector } from "@tanstack/react-store"
import { useQuery } from "@tanstack/react-query"
import { type KeyboardEvent, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { ProviderName } from "@src/shared/providers"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { MenuLabel, menuRowClassName } from "../ui/menu"
import { favoriteModelOptions, modelFavoritesStore, toggleModelFavorite } from "./chat-model-favorites"
import { useModelFavoriteSorting } from "./chat-model-sorting"
import type { BotExecutionUpdate } from "./chat-bot-update"

export function useBotModel(bot: Pick<Bot, "provider" | "model">, client: EngineClient) {
  const { data } = useQuery({ ...client.query.providers.models.queryOptions(), staleTime: Infinity })
  const catalogs = data ?? []
  const catalog = catalogs.find((entry) => entry.provider === bot.provider)
  const currentModelId = bot.model ?? catalog?.default

  return { catalogs, currentModelId, currentModel: catalog?.models.find((model) => model.id === currentModelId) }
}

interface ChatModelOptionsProps {
  bot: Bot
  client: EngineClient
  execution: BotExecutionUpdate
  autoFocusSearch?: boolean
  /** Used by recovery dialogs that finish after choosing a model. */
  onChoose?: () => void
}

export function ChatModelOptions({ bot, client, execution, autoFocusSearch = false, onChoose }: ChatModelOptionsProps) {
  const [query, setQuery] = useState("")
  const favorites = useSelector(modelFavoritesStore, (state) => state.keys)
  const saved = useSelector(modelFavoritesStore, (state) => state.saved)
  const { catalogs, currentModelId } = useBotModel(bot, client)
  const options = favoriteModelOptions(catalogs, favorites, query)
  const sorting = useModelFavoriteSorting(options.filter((model) => model.favorite).map((model) => model.key))
  const total = catalogs.reduce((count, entry) => count + entry.models.length, 0)

  function handleChoose(provider: ProviderName, model: string) {
    if (provider !== bot.provider || model !== currentModelId) {
      execution.update({ setting: "model", value: { provider, model } })
    }

    onChoose?.()
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return
    }

    event.preventDefault()

    if (event.nativeEvent.isComposing || execution.isPending) {
      return
    }

    const model = options.at(0)

    if (!model) {
      return
    }

    handleChoose(model.provider, model.id)
  }

  return (
    <>
      <label className="-mx-1.5 mb-2 flex items-center gap-2 border-b border-outline px-3.5 pb-2 text-secondary">
        <MagnifyingGlassIcon className="size-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">Buscar Modelo</span>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent py-1 text-control text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:text-base"
          type="search"
          autoComplete="off"
          autoFocus={autoFocusSearch}
          placeholder="Buscar modelo…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
      </label>
      {!saved && <p className="m-0 px-2 py-1 text-support text-status-warning" role="status">Favoritos salvos apenas nesta sessão. O armazenamento do dispositivo está indisponível.</p>}
      <div className="-mx-1.5 min-h-0 max-h-64 overflow-y-auto overscroll-contain max-md:max-h-none" aria-label="Modelos" data-model-options>
        {options.length === 0 && <p className="m-0 px-2 py-3 text-support text-secondary">{total === 0 ? "Nenhum modelo disponível. Confira suas Inscrições nas Configurações." : "Nenhum modelo encontrado."}</p>}
        {options.map((model, index) => {
          const selected = model.provider === bot.provider && model.id === currentModelId

          return <div key={model.key}>
            {options[index - 1]?.group !== model.group && <div className={index > 0 ? "mt-2 border-t border-outline px-1.5 pt-2" : "px-1.5"}><MenuLabel>{model.group}</MenuLabel></div>}
            <ChatModelRow model={model} selected={selected} disabled={execution.isPending} sorting={sorting} onChoose={handleChoose} />
          </div>
        })}
      </div>
      <span className="sr-only" role="status">{sorting.notice}</span>
    </>
  )
}

function ChatModelRow({ model, selected, disabled, sorting, onChoose }: {
  model: ReturnType<typeof favoriteModelOptions>[number]
  selected: boolean
  disabled: boolean
  sorting: ReturnType<typeof useModelFavoriteSorting>
  onChoose: (provider: ProviderName, model: string) => void
}) {
  return <div className="relative flex items-center gap-1 px-1.5" data-favorite-key={model.favorite ? model.key : undefined}>
    {sorting.target?.key === model.key && <span className={`pointer-events-none absolute inset-x-1.5 h-px bg-focus ${sorting.target.before ? "top-0" : "bottom-0"}`} aria-hidden="true" />}
    {model.favorite && <IconButton {...sorting.handleProps(model.key)} className={`touch-none select-none ${sorting.dragging === model.key ? "cursor-grabbing bg-surface-active" : "cursor-grab"}`} size={24} iconSize={14} label={`Reordenar ${model.name}`}>
      <Bars2Icon aria-hidden="true" />
    </IconButton>}
    <button
      className={`${menuRowClassName} flex-1 ${selected ? "bg-surface-active text-primary" : "bg-transparent text-secondary enabled:hover:bg-surface-hover enabled:hover:text-primary"}`}
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onChoose(model.provider, model.id)}
    >
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate" title={model.name}>{model.name}</span>
        {model.favorite && <span className="block text-metadata font-normal text-muted">{model.providerName}</span>}
      </span>
      {model.standard && <span className="rounded-md bg-surface-hover px-1.5 py-px text-metadata text-muted">Padrão</span>}
      {selected && <CheckIcon className="size-4 shrink-0" aria-hidden="true" />}
    </button>
    <IconButton size={28} iconSize={14} label={`${model.favorite ? "Desfavoritar" : "Favoritar"} ${model.name} (${model.providerName})`} aria-pressed={model.favorite} onClick={() => toggleModelFavorite(model.provider, model.id)}>
      <StarIcon className={model.favorite ? "fill-current text-primary" : ""} aria-hidden="true" />
    </IconButton>
  </div>
}
