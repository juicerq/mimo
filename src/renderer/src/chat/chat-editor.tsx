import { splitSkillInvocations } from "@src/shared/skill-invocations"
import { memo, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { ChatMentionChip } from "./chat-mention-chip"
import { type ChatMention, splitChatMentions } from "./chat-mentions"
import { ChatSkillChip } from "./chat-skills"

interface ChatEditorProps {
  id: string
  content: string
  caret: number
  mentions: ChatMention[]
  placeholder: string
  label: string
  menuOpen: boolean
  menuId: string
  activeOptionId?: string
  /** Mobile: Enter breaks the line and the send action delivers. Desktop keeps Enter to send and Shift+Enter to break. */
  enterBreaksLine: boolean
  onChange: (content: string, caret?: number) => void
  onCaretChange: (caret: number) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, atStart: boolean) => void
  onPasteFiles: (files: FileList) => void
}

const editorClassName = "relative box-border max-h-40 min-w-0 flex-1 overflow-y-auto rounded-lg px-1 text-body text-primary focus-visible:outline-none min-h-[25px] py-0 whitespace-pre-wrap max-md:max-h-[min(160px,20dvh)] max-md:text-base max-md:leading-[1.55] [overflow-wrap:anywhere] data-[empty=true]:before:pointer-events-none data-[empty=true]:before:absolute data-[empty=true]:before:text-muted data-[empty=true]:before:content-[attr(data-placeholder)]"

function readNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue ?? ""
  }

  if (!(node instanceof HTMLElement)) {
    return ""
  }

  if (node.dataset.token) {
    return node.dataset.token
  }

  if (node.tagName === "BR") {
    return "\n"
  }

  const inner = [...node.childNodes].map(readNode).join("")

  if (node.tagName !== "DIV" && node.tagName !== "P") {
    return inner
  }

  return `\n${inner}`
}

function readEditor(node: Pick<HTMLElement, "childNodes">) {
  const children = [...node.childNodes]
  const last = children.at(-1)
  const written = last instanceof HTMLElement && last.tagName === "BR" ? children.slice(0, -1) : children

  return written.map(readNode).join("")
}

function caretOffset(node: HTMLElement) {
  const selection = window.getSelection()

  if (!selection?.rangeCount) {
    return readEditor(node).length
  }

  const caret = selection.getRangeAt(0)

  if (!node.contains(caret.startContainer)) {
    return readEditor(node).length
  }

  const before = document.createRange()

  before.selectNodeContents(node)
  before.setEnd(caret.startContainer, caret.startOffset)

  return [...before.cloneContents().childNodes].map(readNode).join("").length
}

function restoreCaret(node: HTMLElement, offset: number) {
  const selection = window.getSelection()
  const range = document.createRange()

  range.selectNodeContents(node)
  range.collapse(false)

  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (child) => child.parentElement?.closest("[data-token]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  })
  let remaining = offset

  while (walker.nextNode()) {
    const child = walker.currentNode
    const length = child instanceof HTMLElement ? (child.dataset.token?.length ?? 0) : (child.nodeValue?.length ?? 0)

    if (child.nodeType === Node.TEXT_NODE && remaining <= length) {
      range.setStart(child, remaining)
      range.collapse(true)
      break
    }

    if (length > 0 && remaining <= length) {
      range.setStartAfter(child)
      range.collapse(true)
      break
    }

    remaining -= length
  }

  selection?.removeAllRanges()
  selection?.addRange(range)
}

function caretAtStart(node: HTMLElement) {
  const selection = window.getSelection()

  if (!selection?.isCollapsed || selection.rangeCount === 0) {
    return false
  }

  const caret = selection.getRangeAt(0)
  const before = document.createRange()

  before.selectNodeContents(node)
  before.setEnd(caret.startContainer, caret.startOffset)

  return before.toString().length === 0
}

function scrollCaretIntoView(node: HTMLElement) {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0) {
    return
  }

  const caret = selection.getRangeAt(0)

  if (!node.contains(caret.startContainer)) {
    return
  }

  const end = caret.cloneRange()

  end.collapse(false)

  const clientRects = end.getClientRects()

  if (clientRects.length === 0) {
    node.scrollTop = node.scrollHeight

    return
  }

  const caretRect = [...clientRects].at(-1)

  if (!caretRect) {
    node.scrollTop = node.scrollHeight

    return
  }

  const nodeRect = node.getBoundingClientRect()

  if (caretRect.bottom > nodeRect.bottom) {
    node.scrollTop += caretRect.bottom - nodeRect.bottom
  } else if (caretRect.top < nodeRect.top) {
    node.scrollTop -= nodeRect.top - caretRect.top
  }
}

const ChatEditorContent = memo(
  ({ content, mentions, onRemoveSkill }: { revision: number; content: string; mentions: ChatMention[]; onRemoveSkill: (button: HTMLButtonElement) => void }) => <>
    {splitSkillInvocations(content).map((part) => part.name
      ? <span key={part.start} className="inline-block max-w-full align-baseline" contentEditable={false} data-token={part.text}><ChatSkillChip name={part.name} onRemove={(event) => onRemoveSkill(event.currentTarget)} /></span>
      : splitChatMentions(part.text, mentions).map((segment, index) => (segment.mention
        ? <span key={`${part.start}-${index}-${segment.text}`} className="inline-block align-middle" contentEditable={false} data-token={segment.text}><ChatMentionChip mention={segment.mention} /></span>
        : segment.text)))}
  </>,
  (before, after) => before.revision === after.revision,
)

export function ChatEditor({ id, content, caret, mentions, placeholder, label, menuOpen, menuId, activeOptionId, enterBreaksLine, onChange, onCaretChange, onKeyDown, onPasteFiles }: ChatEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const typed = useRef(content)
  const [revision, setRevision] = useState(0)

  if (content !== typed.current) {
    typed.current = content
    setRevision((current) => current + 1)
  }

  const desiredCaret = useRef(caret)
  desiredCaret.current = caret

  // The contenteditable DOM is replaced on external edits; restore its browser selection after commit.
  useEffect(() => {
    const node = ref.current
    const loose = !document.activeElement || document.activeElement === document.body

    if (revision > 0 && node && (loose || node.contains(document.activeElement))) {
      node.focus()
      restoreCaret(node, desiredCaret.current)
      scrollCaretIntoView(node)
    }
  }, [revision])

  function handleInput() {
    const node = ref.current

    if (!node) {
      return
    }

    typed.current = readEditor(node)
    onChange(typed.current, caretOffset(node))
    scrollCaretIntoView(node)
  }

  function handleSelection() {
    if (ref.current) {
      onCaretChange(caretOffset(ref.current))
    }
  }

  function handleRemoveSkill(button: HTMLButtonElement) {
    const node = ref.current
    const chip = button.closest<HTMLElement>("[data-token]")

    if (!node || !chip?.dataset.token) {
      return
    }

    const current = readEditor(node)
    const before = document.createRange()

    before.selectNodeContents(node)
    before.setEndBefore(chip)

    const start = [...before.cloneContents().childNodes].map(readNode).join("").length

    onChange(current.slice(0, start) + current.slice(start + chip.dataset.token.length), start)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && (event.shiftKey || (enterBreaksLine && !menuOpen))) {
      event.preventDefault()
      document.execCommand("insertLineBreak")
      handleInput()

      return
    }

    onKeyDown(event, ref.current ? caretAtStart(ref.current) : false)
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()

    if (event.clipboardData.files.length > 0) {
      onPasteFiles(event.clipboardData.files)

      return
    }

    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"))
    handleInput()
  }

  return (
    <div
      key={revision}
      ref={ref}
      className={editorClassName}
      id={id}
      contentEditable
      suppressContentEditableWarning
      role="combobox"
      aria-label={label}
      aria-multiline="true"
      aria-expanded={menuOpen}
      aria-controls={menuOpen ? menuId : undefined}
      aria-autocomplete="list"
      aria-activedescendant={activeOptionId}
      data-placeholder={placeholder}
      data-empty={content.length === 0}
      onInput={handleInput}
      onSelect={handleSelection}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    >
      <ChatEditorContent revision={revision} content={content} mentions={mentions} onRemoveSkill={handleRemoveSkill} />
    </div>
  )
}
