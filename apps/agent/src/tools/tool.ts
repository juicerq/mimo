import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { z } from "zod";

const warningSchema = z.object({ warning: z.string().min(1) });

export function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

export function toolWarning(output: string): string | null {
	const parsed = warningSchema.safeParse(parseJson(output));
	if (!parsed.success) {
		return null;
	}
	return parsed.data.warning;
}

export interface ToolDefinition<T extends z.ZodObject> {
	name: string;
	description: string;
	input: T;
	execute: (input: z.output<T>, signal?: AbortSignal) => Promise<unknown>;
	ends?: (input: z.output<T>) => boolean;
}

export function tool<T extends z.ZodObject>(definition: ToolDefinition<T>): AgentTool {
	return {
		name: definition.name,
		label: definition.name,
		description: definition.description,
		parameters: Type.Unsafe(z.toJSONSchema(definition.input, { io: "input" })),
		async execute(_toolCallId, params, signal) {
			const input = definition.input.parse(params);
			const details = await definition.execute(input, signal);
			return { content: [{ type: "text", text: JSON.stringify(details) }], details, terminate: definition.ends?.(input) ?? false };
		},
	};
}
