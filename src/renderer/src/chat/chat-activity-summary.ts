import type { ConversationActivity } from "@src/shared/conversations"

type ActivityStep = ConversationActivity["steps"][number]
type ActivityToolStep = Extract<ActivityStep, { type: "tool" }>

export type ChatActivityToolStatus = "running" | "done" | "failed" | "denied"
type ChatActivityTool = Omit<ActivityToolStep["tools"][number], "status"> & { status: ChatActivityToolStatus }
export type ChatActivityStep =
  | (Extract<ActivityStep, { type: "thinking" }> & { status?: "running" | "done" })
  | (Omit<ActivityToolStep, "tools"> & { tools: ChatActivityTool[] })

interface ToolGroup {
  name: string
  countTargets?: boolean
  namesTargets?: boolean
  prose?: boolean
  active: (count: number, targets: string) => string
  done: (count: number, targets: string) => string
  failed: (count: number, targets: string) => string
  denied: (count: number, targets: string) => string
  running: (count: number, targets: string) => string
}

const toolGroups: ToolGroup[] = [
  {
    name: "read",
    countTargets: true,
    active: (count) => count === 1 ? "lendo arquivo" : `lendo ${count} arquivos`,
    done: (count) => `leu ${formatCount(count, "arquivo", "arquivos")}`,
    failed: (count) => `falhou ao ler ${formatCount(count, "arquivo", "arquivos")}`,
    denied: (count) => `você negou a leitura de ${formatCount(count, "arquivo", "arquivos")}`,
    running: (count) => `deixou ${formatCount(count, "leitura", "leituras")} sem concluir`,
  },
  {
    name: "grep",
    active: (count) => count === 1 ? "buscando no código" : `fazendo ${count} buscas no código`,
    done: (count) => count === 1 ? "buscou no código" : `fez ${count} buscas no código`,
    failed: (count) => count === 1 ? "falhou ao buscar no código" : `falhou em ${count} buscas no código`,
    denied: (count) => count === 1 ? "você negou uma busca no código" : `você negou ${count} buscas no código`,
    running: (count) => `deixou ${formatCount(count, "busca no código", "buscas no código")} sem concluir`,
  },
  {
    name: "find",
    active: (count) => count === 1 ? "procurando arquivos" : `fazendo ${count} buscas por arquivos`,
    done: (count) => count === 1 ? "procurou arquivos" : `fez ${count} buscas por arquivos`,
    failed: (count) => count === 1 ? "falhou ao procurar arquivos" : `falhou em ${count} buscas por arquivos`,
    denied: (count) => count === 1 ? "você negou uma busca por arquivos" : `você negou ${count} buscas por arquivos`,
    running: (count) => `deixou ${formatCount(count, "busca por arquivos", "buscas por arquivos")} sem concluir`,
  },
  {
    name: "ls",
    countTargets: true,
    active: (count) => count === 1 ? "listando pasta" : `listando ${count} pastas`,
    done: (count) => `listou ${formatCount(count, "pasta", "pastas")}`,
    failed: (count) => `falhou ao listar ${formatCount(count, "pasta", "pastas")}`,
    denied: (count) => `você negou a listagem de ${formatCount(count, "pasta", "pastas")}`,
    running: (count) => `deixou ${formatCount(count, "listagem", "listagens")} sem concluir`,
  },
  {
    name: "edit",
    countTargets: true,
    active: (count) => count === 1 ? "editando arquivo" : `editando ${count} arquivos`,
    done: (count) => `editou ${formatCount(count, "arquivo", "arquivos")}`,
    failed: (count) => `falhou ao editar ${formatCount(count, "arquivo", "arquivos")}`,
    denied: (count) => `você negou a edição de ${formatCount(count, "arquivo", "arquivos")}`,
    running: (count) => `deixou ${formatCount(count, "edição", "edições")} sem concluir`,
  },
  {
    name: "write",
    countTargets: true,
    active: (count) => count === 1 ? "criando arquivo" : `criando ${count} arquivos`,
    done: (count) => `criou ${formatCount(count, "arquivo", "arquivos")}`,
    failed: (count) => `falhou ao criar ${formatCount(count, "arquivo", "arquivos")}`,
    denied: (count) => `você negou a criação de ${formatCount(count, "arquivo", "arquivos")}`,
    running: (count) => `deixou ${formatCount(count, "gravação", "gravações")} sem concluir`,
  },
  {
    name: "bash",
    active: (count) => count === 1 ? "executando comando" : `executando ${count} comandos`,
    done: (count) => `executou ${formatCount(count, "comando", "comandos")}`,
    failed: (count) => `${formatCount(count, "comando falhou", "comandos falharam")}`,
    denied: (count) => `você negou ${formatCount(count, "comando", "comandos")}`,
    running: (count) => `deixou ${formatCount(count, "comando", "comandos")} sem concluir`,
  },
  {
    name: "delegate",
    countTargets: true,
    namesTargets: true,
    prose: true,
    active: (_count, targets) => `aguardando ${targets}`,
    done: (_count, targets) => `delegou para ${targets}`,
    failed: (count, targets) => `${count === 1 ? "delegação" : "delegações"} para ${targets} ${count === 1 ? "falhou" : "falharam"}`,
    denied: (_count, targets) => `você negou a delegação para ${targets}`,
    running: (_count, targets) => `deixou ${targets} sem resposta`,
  },
  {
    name: "hire",
    countTargets: true,
    namesTargets: true,
    prose: true,
    active: (_count, targets) => `aguardando ${targets}`,
    done: (_count, targets) => `contratou ${targets}`,
    failed: (count, targets) => `${count === 1 ? "contratação" : "contratações"} de ${targets} ${count === 1 ? "falhou" : "falharam"}`,
    denied: (_count, targets) => `você negou a contratação de ${targets}`,
    running: (_count, targets) => `deixou ${targets} sem resposta`,
  },
  {
    name: "transfer",
    countTargets: true,
    namesTargets: true,
    prose: true,
    active: (_count, targets) => `transferindo para ${targets}`,
    done: (_count, targets) => `transferiu para ${targets}`,
    failed: (count, targets) => `${count === 1 ? "transferência" : "transferências"} para ${targets} ${count === 1 ? "falhou" : "falharam"}`,
    denied: (_count, targets) => `você negou a transferência para ${targets}`,
    running: (_count, targets) => `deixou a transferência para ${targets} sem concluir`,
  },
  {
    name: "routine",
    prose: true,
    active: () => "ajustando uma Rotina",
    done: (count) => count === 1 ? "ajustou uma Rotina" : `ajustou ${count} Rotinas`,
    failed: (count) => count === 1 ? "não conseguiu ajustar a Rotina" : `não conseguiu ajustar ${count} Rotinas`,
    denied: (count) => count === 1 ? "você negou o ajuste da Rotina" : `você negou o ajuste de ${count} Rotinas`,
    running: () => "deixou a Rotina sem ajustar",
  },
  {
    name: "remove_routine",
    prose: true,
    active: () => "removendo uma Rotina",
    done: (count) => count === 1 ? "removeu uma Rotina" : `removeu ${count} Rotinas`,
    failed: (count) => count === 1 ? "não conseguiu remover a Rotina" : `não conseguiu remover ${count} Rotinas`,
    denied: (count) => count === 1 ? "você negou a remoção da Rotina" : `você negou a remoção de ${count} Rotinas`,
    running: () => "deixou a Rotina sem remover",
  },
]

export function formatChatActivitySummary(activity: { steps: ChatActivityStep[] }) {
  const clauses: string[] = []
  const thinkingSteps = activity.steps.filter((step) => step.type === "thinking")
  const thinkingDurationMs = thinkingSteps.reduce((total, step) => total + (step.durationMs ?? 0), 0)
  const hadThinking = thinkingSteps.some((step) => !!step.content.trim() || !!step.durationMs)
  const tools = activity.steps.flatMap((step) => step.type === "tool" ? step.tools : [])

  if (hadThinking) {
    clauses.push(thinkingDurationMs > 0
      ? `pensou por ${formatThinkingDuration(thinkingDurationMs)}`
      : "pensou")
  }

  for (const group of toolGroups) {
    clauses.push(...formatToolGroup(tools, group))
  }

  const knownNames = new Set(toolGroups.map((group) => group.name))
  const unknownNames = [...new Set(tools.filter((tool) => !knownNames.has(tool.name)).map((tool) => tool.name))]

  for (const name of unknownNames) {
    clauses.push(...formatUnknownTool(tools, name))
  }

  if (clauses.length === 0) {
    return "Atividade concluída"
  }

  return capitalize(joinClauses(clauses))
}

export function formatChatActivityStepLabel(step: ChatActivityStep) {
  if (step.type === "thinking") {
    if (!step.durationMs) {
      return "Pensou"
    }

    return `Pensou por ${formatThinkingDuration(step.durationMs)}`
  }

  const group = toolGroups.find((candidate) => candidate.name === step.name)

  if (!group) {
    return capitalize(joinClauses(formatUnknownTool(step.tools, step.name)))
  }

  const clauses = formatToolGroup(step.tools, group)

  return capitalize(joinClauses(clauses))
}

export function formatRunningChatActivityStepLabel(step: ChatActivityStep) {
  if (step.type === "thinking") {
    return "Pensando"
  }

  if (step.tools.some((tool) => tool.status === "running" && tool.label === "Navegando com Jev")) {
    return "Navegando com Jev"
  }

  const group = toolGroups.find((candidate) => candidate.name === step.name)

  if (!group) {
    return `Usando ${unknownToolName(step.tools, step.name)}`
  }

  const count = group.countTargets ? countTargets(step.tools) : step.tools.length

  return capitalize(group.active(count, formatTargets(step.tools)))
}

export function splitChatActivitySteps<Step extends ChatActivityStep>(steps: Step[]): Step[] {
  return steps.flatMap((step) => {
    if (step.type !== "tool") {
      return [step]
    }

    const group = toolGroups.find((candidate) => candidate.name === step.name)

    if (!group?.namesTargets) {
      return [step]
    }

    return step.tools.map((tool) => ({ ...step, tools: [tool] }))
  })
}

export function getChatActivityStepDetails(step: Extract<ChatActivityStep, { type: "tool" }>) {
  const group = toolGroups.find((candidate) => candidate.name === step.name)
  const errors = step.tools.flatMap((tool) => tool.error && tool.status !== "denied" ? [tool.error] : [])

  if (step.tools.some((tool) => tool.label === "Navegando com Jev")) {
    return { prose: true, items: [...step.tools.flatMap((tool) => tool.brief ? [tool.brief] : []), ...errors] }
  }

  if (group?.prose) {
    return { prose: true, items: [...new Set([...step.tools.flatMap((tool) => tool.brief ? [tool.brief] : []), ...errors])] }
  }

  return { prose: false, items: [...new Set([...step.tools.flatMap((tool) => tool.detail ? [tool.detail] : []), ...errors])] }
}

function formatToolGroup(tools: ChatActivityTool[], group: ToolGroup) {
  const matchingTools = tools.filter((tool) => tool.name === group.name)
  const clauses: string[] = []

  for (const status of ["done", "failed", "denied", "running"] as const) {
    const toolsWithStatus = matchingTools.filter((tool) => tool.status === status)

    if (toolsWithStatus.length === 0) {
      continue
    }

    const count = group.countTargets ? countTargets(toolsWithStatus) : toolsWithStatus.length
    clauses.push(group[status](count, formatTargets(toolsWithStatus)))
  }

  return clauses
}

export function unknownToolName(tools: ChatActivityTool[], name: string) {
  const label = tools.find((tool) => tool.name === name && tool.label)?.label

  if (!label) {
    return name
  }

  return `${label.charAt(0).toLowerCase()}${label.slice(1)}`
}

function formatUnknownTool(tools: ChatActivityTool[], toolName: string) {
  const matchingTools = tools.filter((tool) => tool.name === toolName)
  const name = unknownToolName(tools, toolName)
  const clauses: string[] = []
  const doneCount = matchingTools.filter((tool) => tool.status === "done").length
  const failedCount = matchingTools.filter((tool) => tool.status === "failed").length
  const deniedCount = matchingTools.filter((tool) => tool.status === "denied").length
  const runningCount = matchingTools.filter((tool) => tool.status === "running").length

  if (doneCount > 0) {
    clauses.push(doneCount === 1 ? `usou ${name}` : `usou ${name} ${doneCount} vezes`)
  }

  if (failedCount > 0) {
    clauses.push(failedCount === 1 ? `${name} falhou` : `${name} falhou ${failedCount} vezes`)
  }

  if (deniedCount > 0) {
    clauses.push(deniedCount === 1 ? `negou ${name}` : `negou ${name} ${deniedCount} vezes`)
  }

  if (runningCount > 0) {
    clauses.push(runningCount === 1 ? `${name} ficou sem concluir` : `${runningCount} usos de ${name} ficaram sem concluir`)
  }

  return clauses
}

function countTargets(tools: ChatActivityTool[]) {
  const targets = new Set(tools.flatMap((tool) => tool.detail ? [tool.detail] : []))
  const toolsWithoutTarget = tools.filter((tool) => !tool.detail).length

  return targets.size + toolsWithoutTarget
}

function formatTargets(tools: ChatActivityTool[]) {
  const targets = [...new Set(tools.flatMap((tool) => tool.detail ? [tool.detail] : []))]

  if (targets.length === 0) {
    return "um Integrante"
  }

  return joinClauses(targets)
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function joinClauses(clauses: string[]) {
  if (clauses.length === 1) {
    return clauses[0]
  }

  return `${clauses.slice(0, -1).join(", ")} e ${clauses.at(-1)}`
}

function formatThinkingDuration(durationMs: number) {
  if (durationMs < 1_000) {
    return "menos de 1s"
  }

  const totalSeconds = Math.round(durationMs / 1_000)

  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (seconds === 0) {
    return `${minutes}min`
  }

  return `${minutes}min ${seconds}s`
}

function capitalize(value: string) {
  if (!value) {
    return "Atividade"
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}
