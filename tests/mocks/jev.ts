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
    const option = z.object({ action: z.literal("click"), name: z.string() }).or(z.object({ action: z.literal("fill"), field: z.object({ name: z.string() }), supplied: z.string() }))
    const label = (description: unknown) => {
      const parsed = option.safeParse(description)

      if (!parsed.success) {
        return
      }

      if (parsed.data.action === "click") {
        return parsed.data.name
      }

      return `${parsed.data.field.name}=${parsed.data.supplied}`
    }
    // names:A|B picks the first click on a target named A or B; fill:Field=Value picks that field and supplied value; find:A keeps paging with more_targets until a click on A is offered.
    const choose = (name: string, criteria: Record<string, unknown>) => {
      const requested = overrides[name]
      const matching = (wanted: string[]) => wanted.flatMap((entry) => Object.entries(criteria).filter(([, description]) => label(description) === entry).map(([key]) => key))

      if (requested?.startsWith("find:")) {
        return matching([requested.slice(5)]).at(0) ?? "more_targets"
      }

      if (requested?.startsWith("names:")) {
        return matching(requested.slice(6).split("|")).at(0) ?? Object.keys(criteria).at(0)
      }

      if (requested?.startsWith("fill:")) {
        return matching([requested.slice(5)]).at(0) ?? Object.keys(criteria).at(0)
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
