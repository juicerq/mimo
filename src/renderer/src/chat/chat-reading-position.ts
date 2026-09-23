interface ReadingPosition {
  messageId: string
  offset: number
}

const positions = new Map<string, ReadingPosition>()
const windows = new Map<string, number>()

export const chatReadingPosition = {
  clear(botId: string) {
    positions.delete(botId)
    windows.delete(botId)
  },
  shown(botId: string, initial: number) {
    return windows.get(botId) ?? initial
  },
  reveal(botId: string, step: number, initial: number) {
    const shown = (windows.get(botId) ?? initial) + step
    windows.set(botId, shown)

    return shown
  },
  save(botId: string, viewport: HTMLElement, following: boolean) {
    if (following) {
      positions.delete(botId)
      return
    }

    const top = viewport.getBoundingClientRect().top
    const message = Array.from(viewport.querySelectorAll<HTMLElement>("[data-message-id]")).find((node) => node.getBoundingClientRect().bottom > top)
    const messageId = message?.dataset.messageId

    if (messageId && message) {
      positions.set(botId, { messageId, offset: message.getBoundingClientRect().top - top })
    }
  },
  restore(botId: string, viewport: HTMLElement) {
    const position = positions.get(botId)

    if (!position) {
      return "end"
    }

    const message = Array.from(viewport.querySelectorAll<HTMLElement>("[data-message-id]")).find((node) => node.dataset.messageId === position.messageId)

    if (!message) {
      return "loading"
    }

    viewport.scrollTop += message.getBoundingClientRect().top - viewport.getBoundingClientRect().top - position.offset

    return "restored"
  },
}
