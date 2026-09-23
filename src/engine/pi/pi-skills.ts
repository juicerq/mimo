import { splitSkillInvocations } from "@src/shared/skill-invocations"
import type { Skill } from "@earendil-works/pi-coding-agent"

/** Use pi's own discovery, including user skills, project skills and configured packages. */
export async function loadPiSkills(cwd: string) {
  const { DefaultResourceLoader, getAgentDir } = await import("@earendil-works/pi-coding-agent")
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  })

  await loader.reload()

  return loader.getSkills()
}

/** Expand explicit invocations wherever they appear, including steering messages. */
export async function expandPiSkills(content: string, skills: Skill[]) {
  const segments = splitSkillInvocations(content)

  if (!segments.some((segment) => segment.name)) {
    return content
  }

  const { stripFrontmatter } = await import("@earendil-works/pi-coding-agent")
  const expanded = await Promise.all(segments.map(async (segment) => {
    const skill = skills.find((candidate) => candidate.name === segment.name)

    if (!skill) {
      return segment.text
    }

    const body = stripFrontmatter(await Bun.file(skill.filePath).text()).trim()

    return `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`
  }))

  return expanded.join("")
}
