import { Mock } from "@lobomfz/ghostapi"
import { z } from "zod"

export const JevMock = await Mock.create({}, (app) => {
  let status = 200
  let overrides: Record<string, string> = {}
  let delay = 0
  const requests: unknown[] = []
  app.post("/v1/systemone", async ({ body, set }) => {
    requests.push(body)
    if (delay) {
      await Bun.sleep(delay)
    }
    set.status = status
    if (status !== 200) {
      return { error: "controlled failure" }
    }
    const keysNamed = (criteria: Record<string, unknown>, names: string[]) => names.flatMap((wanted) => Object.entries(criteria).filter(([, description]) => z.object({ name: z.literal(wanted) }).safeParse(description).success).map(([key]) => key))
    const choose = (name: string, criteria: Record<string, unknown>) => {
      const requested = overrides[name]

      // find: keeps paging with more_targets until the named target is offered, then clicks it.
      if (requested?.startsWith("find:")) {
        if (keysNamed(body.questions.click_target?.criteria ?? {}, [requested.slice(5)]).length) {
          return "click"
        }

        return "more_targets"
      }

      if (requested?.startsWith("names:")) {
        return keysNamed(criteria, requested.slice(6).split("|")).at(0) ?? Object.keys(criteria).at(0)
      }

      return requested ?? Object.keys(criteria).at(0)
    }
    const answers = Object.fromEntries(Object.entries(body.questions).map(([name, question]) => {
      const selected = choose(name, question.criteria)
      return [name, { type: "choice", choice: selected, confidence: 0.99, probabilities: Object.fromEntries(Object.keys(question.criteria).map((key) => [key, key === selected ? 1 : 0])) }]
    }))
    return { model: "jev-test", answers, usage: { input_tokens: 30, output_tokens: 5 } }
  }, { body: z.object({ state: z.unknown(), model: z.string(), questions: z.record(z.string(), z.object({ type: z.literal("choice"), instructions: z.unknown(), criteria: z.record(z.string(), z.unknown()) })) }) })

  return {
    requests,
    respond(input: { status?: number; choices?: Record<string, string>; delay?: number }) {
      status = input.status ?? 200
      overrides = input.choices ?? {}
      delay = input.delay ?? 0
      requests.length = 0
    },
  }
}, { base_url: z.string().parse(process.env.TYPESAFE_BASE_URL) })
