import type { CSSProperties } from "react"
import { menuCardClassName } from "../ui/menu"

export const chatControlChipClassName = "flex h-[26px] max-md:min-h-11 max-md:min-w-11 shrink-0 items-center gap-1 rounded-md border-0 bg-transparent px-2 text-metadata font-medium whitespace-nowrap text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none [&>svg]:size-3 [&>svg]:stroke-2"
export const chatControlPopoverClassName = `${menuCardClassName} chat-control-popover inset-auto mb-2 [position-area:top_span-left] [position-try-fallbacks:flip-block,flip-inline]`
export function chatControlAnchor(popoverId: string) {
  const anchorName = `--${popoverId}`

  return {
    anchorName,
    trigger: { anchorName } satisfies CSSProperties,
    popover: { positionAnchor: anchorName } satisfies CSSProperties,
  }
}
