import {
	BACKGROUND_CONTEXT,
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
	withAbortSignal,
	type AgentHarnessTool,
	type AgentHarnessToolInvocation,
	type AgentTool,
	type ExecutionToolContext,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/harness/env/nodejs";
import { homedir } from "node:os";

const NO_UPDATE = () => {};

export function computerInstructions(): string {
	return `As tools do computador rodam a partir de ${homedir()}. Use caminhos absolutos; \`~\` só funciona dentro de um comando do \`bash\`.`;
}

function toolContext(): ExecutionToolContext {
	return { env: new NodeExecutionEnv({ cwd: homedir() }) };
}

function stubInvocation(toolCallId: string): AgentHarnessToolInvocation {
	return {
		invocationId: toolCallId,
		operationId: toolCallId,
		turnId: toolCallId,
		getMemo: async () => {},
		setMemo: async () => {},
	};
}

function adapt(harnessTool: AgentHarnessTool<ExecutionToolContext>, context: ExecutionToolContext): AgentTool {
	return {
		...harnessTool,
		async execute(toolCallId, params, signal, onUpdate) {
			return await harnessTool.execute(
				toolCallId,
				params,
				onUpdate ?? NO_UPDATE,
				context,
				stubInvocation(toolCallId),
				signal ? withAbortSignal(signal, BACKGROUND_CONTEXT) : BACKGROUND_CONTEXT,
			);
		},
	};
}

export function computerTools(): AgentTool[] {
	const context = toolContext();

	return [createBashTool(), createReadTool(), createWriteTool(), createEditTool()].map((harnessTool) => adapt(harnessTool, context));
}
