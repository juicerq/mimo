import type { MouseEvent } from "react"
import { SparklesIcon } from "@heroicons/react/24/outline"
import type { Skill } from "@src/shared/skills"
import { chatSlash } from "./chat-command-definitions"

export function suggestChatSkills(content: string, skills: Skill[], caret: number) {
  const word = chatSlash(content, caret)?.word

  if (word === undefined) {
    return []
  }

  const query = word.replace(/^skill:/i, "").toLowerCase()

  return skills.filter((skill) => skill.name.toLowerCase().includes(query))
}

export function applyChatSkill(content: string, name: string, caret: number) {
  const slash = chatSlash(content, caret)
  const start = slash?.start ?? caret
  const end = slash?.end ?? caret
  const token = `/skill:${name} `

  return { content: content.slice(0, start) + token + content.slice(end), caret: start + token.length }
}

export function ChatSkillChip({ name, onRemove }: { name: string; onRemove?: (event: MouseEvent<HTMLButtonElement>) => void }) {
  const className = "inline-flex max-w-[min(100%,16rem)] items-center gap-1 align-baseline rounded-sm font-sans font-normal text-secondary"
  const children = <><SparklesIcon className="size-3.5 shrink-0 self-center" aria-hidden="true" /><span className="truncate underline decoration-outline-strong underline-offset-3">{name}</span></>

  if (!onRemove) {
    return <span className={className}>{children}</span>
  }

  return <button type="button" className={`${className} hover:text-primary active:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`} aria-label={`Remover skill ${name}`} onClick={onRemove}>{children}</button>
}
