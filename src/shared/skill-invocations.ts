export function splitSkillInvocations(content: string) {
  const segments: { text: string; start: number; name?: string }[] = []
  let start = 0

  for (const match of content.matchAll(/(?<!\S)\/skill:([^\s]+)/g)) {
    if (match.index > start) {
      segments.push({ text: content.slice(start, match.index), start })
    }

    segments.push({ text: match[0], start: match.index, name: match[1] })
    start = match.index + match[0].length
  }

  if (start < content.length) {
    segments.push({ text: content.slice(start), start })
  }

  return segments
}

