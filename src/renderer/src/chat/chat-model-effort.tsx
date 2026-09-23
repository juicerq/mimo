import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { useId, useRef, useState } from "react"
import { botEfforts } from "@src/shared/bot-efforts"
import type { Bot, BotEffort } from "@src/shared/bots"
import type { EngineClient } from "../engine-client"
import { useRefreshProviderModels } from "../settings/provider-mutations"
import { type BotExecutionUpdate, useUpdateBotExecution } from "./chat-bot-update"
import { chatControlAnchor, chatControlChipClassName, chatControlPopoverClassName } from "./chat-control-menu"
import { ChatModelOptions, useBotModel } from "./chat-model-picker"

export const effortLabels: Record<BotEffort, string> = { low: "baixo", medium: "médio", high: "alto", xhigh: "muito alto", max: "máximo" }

export function ChatModelEffort({ bot, client, disabled }: { bot: Bot; client: EngineClient; disabled: boolean }) {
  const menuId = `model-effort-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const anchor = chatControlAnchor(menuId)
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const execution = useUpdateBotExecution(bot, client)
  const { mutate: refreshModels } = useRefreshProviderModels(client)
  const { currentModel, currentModelId } = useBotModel(bot, client)
  const modelName = currentModel?.name ?? currentModelId ?? "Modelo"

  return (
    <>
      <button ref={trigger} className={`${chatControlChipClassName} min-w-0 [&>svg]:shrink-0`} type="button" disabled={disabled || execution.isPending} popoverTarget={menuId} popoverTargetAction="show" aria-expanded={open} aria-label={`Modelo e Esforço: ${modelName}, ${effortLabels[bot.effort]}`} style={anchor.trigger}>
        <span className="min-w-0 truncate text-secondary">{modelName}</span>
        <span className="mx-1 h-3 w-px shrink-0 bg-outline" aria-hidden="true" />
        <span className="first-letter:uppercase">{effortLabels[bot.effort]}</span>
        <ChevronDownIcon aria-hidden="true" />
      </button>
      <div className={`${chatControlPopoverClassName} w-80 max-w-[calc(100vw-24px)]`} id={menuId} popover="manual" style={anchor.popover} aria-label="Modelo e Esforço" ref={(panel) => {
        if (!panel) {
          return
        }

        const dismissOutside = (event: PointerEvent) => {
          if (!(event.target instanceof Node) || panel.contains(event.target) || trigger.current?.contains(event.target)) {
            return
          }

          if (panel.matches(":popover-open")) {
            panel.hidePopover()
          }
        }

        document.addEventListener("pointerdown", dismissOutside)

        return () => document.removeEventListener("pointerdown", dismissOutside)
      }} onToggle={(event) => {
        if (event.target !== event.currentTarget) {
          return
        }

        const opening = event.newState === "open"
        setOpen(opening)

        if (opening) {
          refreshModels({})
        }
      }}>
        {open && <>
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-control font-medium text-primary">Modelo</span>
          </div>
          <fieldset className="m-0 min-w-0 border-0 p-0 disabled:opacity-50" disabled={disabled}>
            <ChatModelOptions bot={bot} client={client} execution={execution} autoFocusSearch />
            <div className="-mx-1.5 mt-2 border-t border-outline px-3.5 pt-3 pb-2">
              <ChatEffortOptions bot={bot} execution={execution} />
            </div>
          </fieldset>
          {execution.error && <p className="m-0 px-2 py-2 text-support text-status-error" role="alert">Não foi possível alterar o ajuste: {execution.error.message}</p>}
        </>}
      </div>
    </>
  )
}

export function ChatEffortOptions({ bot, execution }: { bot: Pick<Bot, "effort">; execution: BotExecutionUpdate }) {
  const id = useId()

  function handleChoose(effort: BotEffort) {
    if (effort !== bot.effort) {
      execution.update({ setting: "effort", value: effort })
    }
  }

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" disabled={execution.isPending}>
      <legend className="mb-3 flex w-full items-center gap-2 p-0 text-control text-secondary">
        Esforço <span className="font-medium text-primary first-letter:uppercase">{effortLabels[bot.effort]}</span>
        {bot.effort === "medium" && <span className="ml-auto text-metadata text-muted">Padrão</span>}
      </legend>
      <div className="grid grid-cols-5 gap-1 rounded-lg bg-surface-hover p-1">
        {botEfforts.map((effort) => <label key={effort} className="min-w-0">
          <input className="peer sr-only" type="radio" onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
            }
          }} name={`effort-${id}`} value={effort} checked={effort === bot.effort} onChange={() => handleChoose(effort)} aria-label={`Esforço ${effortLabels[effort]}`} />
          <span className="flex min-h-8 items-center justify-center rounded-md px-1 py-1 text-center text-metadata whitespace-nowrap text-secondary transition-colors duration-150 peer-checked:bg-surface-active peer-checked:text-primary peer-focus-visible:ring-1 peer-focus-visible:ring-ring peer-disabled:opacity-50 peer-enabled:hover:bg-surface-active max-md:min-h-11 motion-reduce:transition-none first-letter:uppercase">{effortLabels[effort]}</span>
        </label>)}
      </div>
      <div className="mt-2 flex justify-between text-metadata text-muted"><span>Mais rápido</span><span>Mais raciocínio</span></div>
    </fieldset>
  )
}
