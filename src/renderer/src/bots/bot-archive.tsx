import { ArrowPathIcon, ArrowTopRightOnSquareIcon, ArrowsPointingInIcon, ClipboardDocumentIcon, DocumentTextIcon, EyeIcon, FolderOpenIcon, LinkIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { Bot } from "@src/shared/bots"
import type { BotArchiveEntry } from "@src/shared/bot-archive"
import type { LocalFileRequest } from "@src/shared/local-files"
import type { EngineClient } from "../engine-client"
import { ContextMenu } from "../ui/context-menu"
import { Drawer } from "../ui/dialog"
import { IconButton } from "../ui/icon-button"
import { useEscape } from "../ui/use-escape"
import { useIsMobile } from "../ui/use-is-mobile"
import { BotPageHeader } from "./bot-page-header"
import { BotArchivePreview } from "./bot-archive-preview"
import { BotArchiveTree } from "./bot-archive-tree"

function fileActionError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Não foi possível acessar o arquivo."
  }

  if (error.message.includes("reply was never sent")) {
    return "O aplicativo não respondeu. Tente novamente."
  }

  return error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")
}

interface FileActionNotice {
  entry: BotArchiveEntry
  text: string
  error: boolean
}

export function BotArchive({ bot, client, onClose }: { bot: Bot; client: EngineClient; onClose: () => void }) {
  const queryClient = useQueryClient()
  const mobile = useIsMobile()
  const [expanded, setExpanded] = useState(new Set<string>())
  const [selected, setSelected] = useState<BotArchiveEntry | null>(null)
  const [inline, setInline] = useState(false)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<FileActionNotice | null>(null)
  const tree = useRef<HTMLDivElement>(null)
  const { data, error, isPending } = useQuery(client.query.archive.list.queryOptions({ input: { botId: bot.id, path: "" }, refetchInterval: 5000 }))
  const archiveKey = client.query.archive.key({ input: { botId: bot.id } })
  const fetching = useIsFetching({ queryKey: archiveKey }) > 0
  useEscape(selected ? closePreview : onClose)

  function closePreview() {
    const path = selected?.path
    setSelected(null)
    requestAnimationFrame(() => {
      const items = [...tree.current?.querySelectorAll<HTMLButtonElement>('[role="treeitem"]:not(:disabled)') ?? []]
      const target = items.find((item) => item.title === path) ?? items.filter((item) => path?.startsWith(`${item.title}/`)).at(-1) ?? items[0]
      target?.focus()
    })
  }

  // The available page width changes with the workspace, independently of the viewport.
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) { return }

    const observer = new ResizeObserver(([entry]) => {
      if (entry) { setInline(!mobile && entry.contentRect.width >= 680) }
    })
    observer.observe(node)

    return () => observer.disconnect()
  }, [mobile])

  function select(entry: BotArchiveEntry) {
    setSelected(entry.kind === "directory" ? null : entry)
    setExpanded((current) => {
      const next = new Set(current)
      const parts = entry.path.split("/")

      if (entry.kind === "directory") { next.add(entry.path) }
      for (let index = 1; index < parts.length; index++) { next.add(parts.slice(0, index).join("/")) }

      return next
    })
  }

  function toggle(path: string) {
    setExpanded((current) => {
      const next = new Set(current)

      if (next.has(path)) { next.delete(path) }
      else { next.add(path) }

      return next
    })
  }

  async function actOnFile(entry: BotArchiveEntry, action: LocalFileRequest["action"]) {
    if (!data) { return }

    setActingOn(entry.path)
    setActionNotice(null)
    const separator = data.directory.includes("\\") && !data.directory.includes("/") ? "\\" : "/"
    const absolutePath = `${data.directory.replace(/[\\/]$/, "")}${separator}${entry.path.split("/").join(separator)}`
    const perform = window.desktop.remote
      ? navigator.clipboard.writeText(absolutePath)
      : window.desktop.fileAction({ action, path: entry.path, directory: data.directory })

    await perform.then(() => {
      if (action === "copy" || action === "copy-path") {
        setActionNotice({ entry, text: action === "copy" ? "Arquivo copiado" : "Localização copiada", error: false })
      }
    }).catch((actionError: unknown) => {
      setActionNotice({ entry, text: fileActionError(actionError), error: true })
    })
    setActingOn(null)
  }

  function fileMenu(entry: BotArchiveEntry, button: ReactNode) {
    return <ContextMenu label={`Ações de ${entry.name}`} actions={[
      { label: "Visualizar", icon: <EyeIcon />, onSelect: () => select(entry) },
      { label: "Abrir arquivo", icon: <ArrowTopRightOnSquareIcon />, separatorBefore: true, disabled: window.desktop.remote || actingOn === entry.path, onSelect: () => void actOnFile(entry, "open") },
      { label: "Mostrar na pasta", icon: <FolderOpenIcon />, disabled: window.desktop.remote || actingOn === entry.path, onSelect: () => void actOnFile(entry, "reveal") },
      { label: "Copiar arquivo", icon: <ClipboardDocumentIcon />, disabled: window.desktop.remote || actingOn === entry.path, onSelect: () => void actOnFile(entry, "copy") },
      { label: "Copiar localização", icon: <LinkIcon />, disabled: actingOn === entry.path, onSelect: () => void actOnFile(entry, "copy-path") },
    ]}>{() => button}</ContextMenu>
  }

  const preview = selected && data && <BotArchivePreview key={selected.path} client={client} botId={bot.id} entry={selected} directory={data.directory} onSelect={select} onClose={closePreview} />

  return <section className="flex h-full min-h-0 flex-col overflow-hidden bg-surface px-8 pt-12 pb-8 max-md:px-4 max-md:py-4" aria-label={`Acervo de ${bot.name}`}>
    <div ref={measure} className="@container/archive mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-8 max-md:gap-5">
      <div className="shrink-0"><BotPageHeader bot={bot} page="archive" /></div>
      <div className="flex min-h-0 flex-1 gap-4 @min-[960px]/archive:gap-8 max-md:gap-0">
        <div className={`flex min-h-0 min-w-0 flex-col ${inline ? "w-[clamp(240px,32%,384px)] shrink-0" : "w-full"}`}>
          <div className="mb-3 flex shrink-0 items-center justify-between gap-3 px-2">
            <h3 className="m-0 text-control font-semibold text-secondary">Pastas e arquivos</h3>
            <div className="flex items-center gap-1">
              <IconButton label="Recolher pastas" disabled={expanded.size === 0} onClick={() => setExpanded(new Set())}><ArrowsPointingInIcon aria-hidden="true" /></IconButton>
              <IconButton label="Atualizar Acervo" disabled={fetching} onClick={() => void queryClient.invalidateQueries({ queryKey: archiveKey })}><ArrowPathIcon className={fetching ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" /></IconButton>
            </div>
          </div>
          <div ref={tree} className="min-h-0 flex-1 overflow-auto px-1 pb-2">
            {isPending && <p role="status" className="px-2 text-support text-secondary">Carregando arquivos…</p>}
            {error && <p role="alert" className="px-2 text-support text-status-error">Não foi possível carregar os arquivos: {error.message}</p>}
            {data?.entries.length === 0 && <p className="px-2 text-support text-secondary">Nenhum arquivo ainda. Os arquivos criados pelo Bot nesta pasta aparecerão aqui.</p>}
            {data && <BotArchiveTree client={client} botId={bot.id} entries={data.entries} expanded={expanded} selected={selected?.path} onToggle={toggle} onSelect={select} fileMenu={fileMenu} />}
          </div>
        </div>
        <ArchiveViewer inline={inline} selected={selected} onClose={closePreview}>{preview}</ArchiveViewer>
      </div>
    </div>
    {actionNotice && <ArchiveNotice notice={actionNotice} onClose={() => setActionNotice(null)} />}
  </section>
}

function ArchiveViewer({ inline, selected, onClose, children }: { inline: boolean; selected: BotArchiveEntry | null; onClose: () => void; children: ReactNode }) {
  if (!inline) {
    return selected && children && <Drawer title={`Prévia de ${selected.name}`} onClose={onClose}>{children}</Drawer>
  }

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-surface-raised">
    {children || <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <DocumentTextIcon aria-hidden="true" className="size-8 text-muted" />
      <p className="m-0 text-section font-semibold text-secondary">Selecione um arquivo</p>
      <p className="m-0 max-w-64 text-support text-muted">Visualize documentos, páginas e imagens aqui, ao lado das pastas.</p>
    </div>}
  </div>
}

function ArchiveNotice({ notice, onClose }: { notice: FileActionNotice; onClose: () => void }) {
  return createPortal(<div
      popover="auto"
      ref={(element) => { element?.showPopover() }}
      onToggle={(event) => {
        if (event.newState === "closed") {
          onClose()
        }
      }}
      className="fixed inset-auto right-4 bottom-4 m-0 max-h-[calc(100dvh-2rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-outline bg-surface-raised p-3 font-sans text-support text-primary shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1" role={notice.error ? "alert" : "status"}>
          <p className="truncate font-medium" title={notice.entry.path}>{notice.entry.name}</p>
          <p className={`mt-1 wrap-anywhere ${notice.error ? "text-status-error" : "text-secondary"}`}>{notice.text}</p>
        </div>
        <button type="button" aria-label="Fechar aviso" className="shrink-0 rounded-sm p-1 text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => onClose()}>
          <XMarkIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>, document.body)
}
