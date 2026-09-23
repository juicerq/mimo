import { AdjustmentsHorizontalIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import type { Bot } from "@src/shared/bots"
import { useUpdateBotExecution } from "./chat-bot-update"
import type { EngineClient } from "../engine-client"
import { Dialog, DialogBody } from "../ui/dialog"
import { IconButton } from "../ui/icon-button"
import { ChatModelOptions, useBotModel } from "./chat-model-picker"
import { ChatEffortOptions, effortLabels } from "./chat-model-effort"
import { ChatPermissionOptions, permissionModeLabels } from "./chat-permission"

const pageTitles = { options: "Opções da conversa", model: "Modelo e esforço", permission: "Permissões" }
type Page = keyof typeof pageTitles

export function ChatMobileOptions({ bot, client, disabled, permissionDisabled }: { bot: Bot; client: EngineClient; disabled: boolean; permissionDisabled: boolean }) {
  const [open, setOpen] = useState(false)

  return <>
    <IconButton type="button" label="Opções da conversa" onClick={() => setOpen(true)}><AdjustmentsHorizontalIcon /></IconButton>
    {open && <ChatOptionsDialog bot={bot} client={client} disabled={disabled} permissionDisabled={permissionDisabled} onClose={() => setOpen(false)} />}
  </>
}

function ChatOptionsDialog({ bot, client, disabled, permissionDisabled, onClose }: { bot: Bot; client: EngineClient; disabled: boolean; permissionDisabled: boolean; onClose: () => void }) {
  const [page, setPage] = useState<Page>("options")
  const execution = useUpdateBotExecution(bot, client)
  const { currentModel, currentModelId } = useBotModel(bot, client)
  const close = onClose
  const rows = [
    { page: "model", label: "Modelo e esforço", value: `${currentModel?.name ?? currentModelId ?? "Padrão do Bot"} · ${effortLabels[bot.effort]}` },
    { page: "permission", label: "Permissões", value: permissionModeLabels[bot.permissionMode] },
  ] satisfies { page: Page; label: string; value: string }[]

  return <Dialog eyebrow={bot.name} title={pageTitles[page]} onClose={close}><DialogBody>
      {execution.error && <p className="m-0 text-support text-status-error" role="alert">Não foi possível alterar o ajuste: {execution.error.message}</p>}
      {page !== "options" && <button type="button" className="flex min-h-11 items-center gap-2 rounded-lg text-left text-control text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => setPage("options")}><ChevronLeftIcon className="size-4" />Opções da conversa</button>}
      {page === "options" && <div className="flex flex-col divide-y divide-outline">{rows.map((row) => <button type="button" key={row.page} className="flex min-h-16 items-center gap-3 rounded-lg py-3 text-left text-control text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50" disabled={(row.page === "permission" ? permissionDisabled : disabled) || execution.isPending} onClick={() => setPage(row.page)}><span>{row.label}</span><span className="ml-auto min-w-0 truncate text-support text-secondary">{row.value}</span><ChevronRightIcon className="size-4 shrink-0 text-muted" /></button>)}</div>}
      {disabled && <p className="m-0 text-support text-secondary">Modelo e esforço ficam disponíveis quando o Bot estiver parado e o computador conectado.</p>}
      {!disabled && page === "model" && <>
        <ChatModelOptions bot={bot} client={client} execution={execution} />
        <div className="border-t border-outline pt-4"><ChatEffortOptions bot={bot} execution={execution} /></div>
      </>}
      {!permissionDisabled && page === "permission" && <ChatPermissionOptions bot={bot} execution={execution} onChoose={close} />}
    </DialogBody></Dialog>
}
