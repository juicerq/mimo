import { ChevronRightIcon, CodeBracketIcon, DocumentIcon, DocumentTextIcon, FolderIcon, FolderOpenIcon, MusicalNoteIcon, PhotoIcon, VideoCameraIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useState, type KeyboardEvent, type ReactNode } from "react"
import type { BotArchiveEntry } from "@src/shared/bot-archive"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"

interface ArchiveTreeProps {
  client: EngineClient
  botId: string
  entries: BotArchiveEntry[]
  expanded: Set<string>
  selected?: string
  onToggle: (path: string) => void
  onSelect: (entry: BotArchiveEntry) => void
  fileMenu: (entry: BotArchiveEntry, button: ReactNode) => ReactNode
}

function fileIcon(name: string) {
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(name)) { return PhotoIcon }
  if (/\.(md|markdown|txt|pdf)$/i.test(name)) { return DocumentTextIcon }
  if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(name)) { return MusicalNoteIcon }
  if (/\.(mp4|webm|mov)$/i.test(name)) { return VideoCameraIcon }
  if (/\.(html?|css|[cm]?[jt]sx?|jsonl?|ya?ml|xml|toml)$/i.test(name)) { return CodeBracketIcon }

  return DocumentIcon
}

function entryStateClass(entry: BotArchiveEntry, selected: boolean, open: boolean) {
  if (selected) {
    return "bg-surface-active text-primary"
  }

  if (open) {
    return "bg-surface-raised font-semibold text-primary"
  }

  if (entry.kind === "directory") {
    return "font-medium text-secondary"
  }

  return "text-secondary"
}

export function BotArchiveTree(props: ArchiveTreeProps) {
  const [focused, setFocused] = useState<string>()
  const ancestors = focused?.split("/").slice(0, -1) ?? []
  const focusVisible = ancestors.every((_, index) => props.expanded.has(ancestors.slice(0, index + 1).join("/")))
  const tabStop = focusVisible && focused ? focused : props.entries.find((entry) => entry.kind !== "unavailable")?.path

  function handleKey(event: KeyboardEvent<HTMLUListElement>) {
    if (!(event.target instanceof HTMLButtonElement) || event.target.getAttribute("role") !== "treeitem") {
      return
    }

    const item = event.target
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="treeitem"]:not(:disabled)')]
    const index = items.indexOf(item)
    const positions: Record<string, number> = { ArrowDown: Math.min(index + 1, items.length - 1), ArrowUp: Math.max(index - 1, 0), Home: 0, End: items.length - 1 }
    const next = positions[event.key]

    if (next !== undefined) {
      event.preventDefault()
      items[next]?.focus()
    }

    if (event.key === "ArrowRight") {
      event.preventDefault()

      if (item.getAttribute("aria-expanded") === "false") { item.click() }
      else if (item.getAttribute("aria-expanded") === "true") { item.closest("li")?.querySelector<HTMLButtonElement>('ul[role="group"] [role="treeitem"]:not(:disabled)')?.focus() }
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault()

      if (item.getAttribute("aria-expanded") === "true") { item.click() }
      else { item.closest("ul[role=group]")?.parentElement?.querySelector<HTMLButtonElement>('[role="treeitem"]')?.focus() }
    }
  }

  return <ul role="tree" aria-label="Arquivos e pastas" className="m-0 list-none p-0" onKeyDown={handleKey}>
    <ArchiveEntries {...props} level={1} focused={tabStop} onFocus={setFocused} />
  </ul>
}

interface ArchiveEntriesProps extends ArchiveTreeProps {
  level: number
  focused?: string
  onFocus: (path: string) => void
}

function ArchiveEntries(props: ArchiveEntriesProps) {
  const directories = props.entries.filter((entry) => entry.kind === "directory")
  const files = props.entries.filter((entry) => entry.kind !== "directory")

  return <>
    <ArchiveEntryGroup {...props} entries={directories} />
    {directories.length > 0 && files.length > 0 && <li role="none" aria-hidden="true" className="h-2" />}
    <ArchiveEntryGroup {...props} entries={files} />
  </>
}

function ArchiveEntryGroup(props: ArchiveEntriesProps) {
  const { entries, expanded, selected, level, focused, onFocus, onToggle, onSelect, fileMenu } = props

  return <>
    {entries.map((entry) => {
      const directory = entry.kind === "directory"
      const open = directory && expanded.has(entry.path)
      const Icon = directory ? FolderIcon : fileIcon(entry.name)
      const button = <button
        type="button"
        role="treeitem"
        aria-label={entry.name}
        aria-level={level}
        aria-selected={selected === entry.path}
        aria-expanded={directory ? open : undefined}
        disabled={entry.kind === "unavailable"}
        tabIndex={focused === entry.path ? 0 : -1}
        title={entry.path}
        className={`flex min-h-10 w-full items-center gap-2 rounded-sm py-2 pr-3 pl-2 text-left text-control transition-colors hover:bg-surface-hover active:bg-surface-active focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 max-md:min-h-11 ${entryStateClass(entry, selected === entry.path, open)}`}
        onFocus={() => onFocus(entry.path)}
        onClick={() => directory ? onToggle(entry.path) : onSelect(entry)}
      >
        <ChevronRightIcon aria-hidden="true" className={`size-3 shrink-0 text-muted transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""} ${directory ? "" : "invisible"}`} />
        {open ? <FolderOpenIcon aria-hidden="true" className="size-4 shrink-0" /> : <Icon aria-hidden="true" className="size-4 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        {entry.kind === "unavailable" && <span className="shrink-0 text-metadata text-muted">Sem acesso</span>}
      </button>

      return <li key={entry.path} role="none">
        {directory || entry.kind === "unavailable" ? button : fileMenu(entry, button)}
        {open && <ul role="group" className="m-0 ml-4 list-none border-l border-outline py-1 pl-1"><ArchiveBranch {...props} path={entry.path} level={level + 1} /></ul>}
      </li>
    })}
  </>
}

function ArchiveBranch(props: ArchiveEntriesProps & { path: string }) {
  const { data, error, isPending, refetch } = useQuery(props.client.query.archive.list.queryOptions({ input: { botId: props.botId, path: props.path }, refetchInterval: 5000 }))

  return <>
    {isPending && <li role="none" className="px-8 py-2 text-support text-secondary"><span role="status">Carregando pasta…</span></li>}
    {error && <li role="none" className="px-8 py-2"><p role="alert" className="text-support text-status-error">Não foi possível carregar esta pasta.</p><Button variant="text" onClick={() => void refetch()}>Tentar novamente</Button></li>}
    {data?.entries.length === 0 && <li role="none" className="px-8 py-2 text-support text-muted">Pasta vazia</li>}
    {data && <ArchiveEntries {...props} entries={data.entries} />}
  </>
}
