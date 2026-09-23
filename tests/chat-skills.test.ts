import { expect, test } from "bun:test"
import { join } from "node:path"
import { applyChatSkill } from "@src/renderer/src/chat/chat-skills"
import { splitSkillInvocations } from "@src/shared/skill-invocations"
import { expandPiSkills, loadPiSkills } from "@src/engine/pi/pi-skills"
import { testDirectory } from "./support/test-directory"

const directory = testDirectory("mimo-skills-")

test.each([
  ["/dog|", "/skill:dogama-vault "],
  ["Analise o vault /dog|", "Analise o vault /skill:dogama-vault "],
  ["Analise /dog| e responda.", "Analise /skill:dogama-vault  e responda."],
  ["/skill:existing Depois /dog|", "/skill:existing Depois /skill:dogama-vault "],
])("inserts a skill at the invocation and places the caret after it: %s", (marked, expected) => {
  const result = applyChatSkill(marked.replace("|", ""), "dogama-vault", marked.indexOf("|"))

  expect(result.content).toBe(expected)
  expect(result.content.slice(0, result.caret).endsWith("/skill:dogama-vault ")).toBe(true)
})

test("preserves whitespace, order and repeated skills for both editor and sent messages", () => {
  const content = "Primeiro\n/skill:dogama-vault e /skill:review\nDepois /skill:dogama-vault "
  const parts = splitSkillInvocations(content)

  expect(parts.map((part) => part.text).join("")).toBe(content)
  expect(parts.filter((part) => part.name).map((part) => part.name)).toEqual(["dogama-vault", "review", "dogama-vault"])

  for (const part of parts) {
    expect(content.slice(part.start, part.start + part.text.length)).toBe(part.text)
  }

  expect(splitSkillInvocations("https://example.com/skill:test /tmp/skill:test").some((part) => part.name)).toBe(false)
})

test("loads explicit inline skills from real files while preserving surrounding instructions", async () => {
  await Bun.write(join(directory, ".pi/skills/example/SKILL.md"), "---\nname: example\ndescription: Example skill\n---\nFollow the example instructions.")
  const { skills } = await loadPiSkills(directory)
  const content = "Antes\n/skill:example\nDepois /skill:unknown"
  const expanded = await expandPiSkills(content, skills)

  expect(expanded.startsWith('Antes\n<skill name="example"')).toBe(true)
  expect(expanded).toContain("Follow the example instructions.")
  expect(expanded.endsWith("</skill>\nDepois /skill:unknown")).toBe(true)
  expect(expanded).not.toContain("description: Example skill")
})
