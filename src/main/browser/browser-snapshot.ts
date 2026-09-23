import type { BrowserCandidate } from "@src/shared/browser"

const candidateLimit = 1_000
const clickable = new Set(["link", "button", "tab", "menuitem"])
const fillable = new Set(["textbox", "searchbox"])
const landmarks = new Set(["navigation", "main", "banner", "contentinfo", "complementary", "form", "dialog", "alertdialog", "region", "menu", "tablist", "search"])
const sensitiveName = /password|senha|secret|segredo|token|api.?key|cart[aã]o|credit.card|cvv|otp|c[oó]digo.de.verifica/i
const riskyName = /pay|pagar|pagamento|comprar|purchase|buy|checkout|delete|excluir|apagar|remover|remove|enviar|submit|confirmar|confirm|transfer|download|baixar|upload|entrar|log.?in|sign.?in/i

const snapshotLine = /^(\s*)- (\S+)(?: "((?:[^"\\]|\\.)*)")?(?: \[([^\]]*)\])?(.*)$/

// Bracketed attributes look like `ref=e3, expanded=false, url=https://…`; bare flags such as `disabled` mean true.
function readAttributes(raw: string) {
  return new Map(raw.split(/, (?=[a-z]+(?:=|,|$))/).filter(Boolean).map((part) => {
    const [key = "", ...value] = part.split("=")

    return [key, value.join("=") || "true"]
  }))
}

function readLine(line: string) {
  const match = snapshotLine.exec(line)

  if (!match) {
    return []
  }

  const [, space = "", role = "", name, attributes = "", rest = ""] = match

  return [{ indent: space.length, role, name: name?.replace(/\\(.)/g, "$1"), attributes: readAttributes(attributes), value: /^: (.*)$/.exec(rest)?.[1] }]
}

function details(line: ReturnType<typeof readLine>[number], context: string[]) {
  const url = line.attributes.get("url")
  const expanded = line.attributes.get("expanded")

  return {
    ...(line.value ? { value: line.value } : {}),
    ...(url ? { url } : {}),
    ...(expanded ? { expanded: expanded === "true" } : {}),
    ...(line.attributes.get("selected") === "true" ? { selected: true } : {}),
    ...(line.attributes.get("disabled") === "true" ? { disabled: true } : {}),
    ...(context.length ? { context: [...new Set(context)].join(" › ").slice(0, 160) } : {}),
  }
}

// Attributes, current values and grouping come from the same snapshot that assigned the refs, so each one stays bound to its element.
function describeSnapshot(snapshot: string) {
  const described = new Map<string, ReturnType<typeof details>>()
  const frames: { indent: number; label?: string }[] = []
  let heading: string | undefined

  for (const line of snapshot.split("\n").flatMap(readLine)) {
    while ((frames.at(-1)?.indent ?? -1) >= line.indent) {
      frames.pop()
    }

    const parent = frames.at(-1)
    const ref = line.attributes.get("ref")

    // A disclosure names the group its siblings belong to, e.g. the items of an open menu.
    if (parent && line.name && line.attributes.get("expanded") === "true") {
      parent.label = line.name
    }

    if (line.role === "heading" && line.name) {
      heading = line.name
    }

    if (ref) {
      described.set(ref, details(line, [...frames.flatMap((frame) => frame.label ? [frame.label] : []), ...(heading ? [heading] : [])]))
    }

    frames.push({ indent: line.indent, ...(landmarks.has(line.role) && line.name ? { label: line.name } : {}) })
  }

  return described
}

function operations(role: string, name: string, disabled?: boolean): ("click" | "fill")[] {
  if (disabled) {
    return []
  }

  if (fillable.has(role)) {
    return ["fill"]
  }

  if (riskyName.test(name)) {
    return []
  }

  return ["click"]
}

export function sanitizeUrl(raw: string, base: string) {
  const url = new URL(raw, base)
  url.username = ""
  url.password = ""

  for (const key of [...url.searchParams.keys()].filter((key) => /token|key|secret|sig|auth|code|session|password|senha/i.test(key))) {
    url.searchParams.set(key, "redacted")
  }

  if (url.origin === new URL(base).origin) {
    return `${url.pathname}${url.search}${url.hash}`
  }

  return url.toString()
}

// Turns an agent-browser snapshot into the targets offered to Jev, keeping each ref bound to the element the snapshot described.
export function snapshotCandidates(raw: { snapshot: string; refs: Record<string, { role: string; name: string }> }, pageUrl: string) {
  const described = describeSnapshot(raw.snapshot)
  // Refs are numbered in page order; the JSON object does not keep that order.
  const ordered = Object.entries(raw.refs).sort(([left], [right]) => Number(left.slice(1)) - Number(right.slice(1)))
  const eligible = ordered.flatMap(([ref, entry]): BrowserCandidate[] => {
    const details = described.get(ref) ?? {}

    if (!(clickable.has(entry.role) || fillable.has(entry.role)) || sensitiveName.test(entry.name) || /^•+$/.test(details.value ?? "")) {
      return []
    }

    return [{
      ref: `@${ref}`,
      role: entry.role,
      name: entry.name.slice(0, 300),
      operations: operations(entry.role, entry.name, details.disabled),
      ...details,
      ...(details.value ? { value: details.value.slice(0, 300) } : {}),
      ...(details.url ? { url: sanitizeUrl(details.url, pageUrl).slice(0, 300) } : {}),
    }]
  })

  return { candidates: eligible.slice(0, candidateLimit), omitted: Math.max(0, eligible.length - candidateLimit) }
}
