import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { z } from "zod";

export interface ToolDefinition<T extends z.ZodObject> {
	name: string;
	description: string;
	input: T;
	execute: (input: z.output<T>, signal?: AbortSignal) => Promise<unknown>;
}

export function tool<T extends z.ZodObject>(definition: ToolDefinition<T>): AgentTool {
	return {
		name: definition.name,
		label: definition.name,
		description: definition.description,
		parameters: Type.Unsafe(z.toJSONSchema(definition.input, { io: "input" })),
		async execute(_toolCallId, params, signal) {
			const details = await definition.execute(definition.input.parse(params), signal);
			return { content: [{ type: "text", text: JSON.stringify(details) }], details };
		},
	};
}
