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
import instructions from "./instructions.md" with { type: "text" };
import { workDir } from "./folder";

const NO_UPDATE = () => {};

export function computerInstructions(folder: string | undefined): string {
	const place = folder === undefined ? "" : ", a pasta deste bot";
	return `${instructions}\nAs tools do computador rodam a partir de ${workDir(folder)}${place}. Use caminhos absolutos; \`~\` só funciona dentro de um comando do \`bash\`.`;
}

function toolContext(folder: string | undefined): ExecutionToolContext {
	return { env: new NodeExecutionEnv({ cwd: workDir(folder) }) };
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

export function computerTools(folder: string | undefined): AgentTool[] {
	const context = toolContext(folder);

	return [createBashTool(), createReadTool(), createWriteTool(), createEditTool()].map((harnessTool) => adapt(harnessTool, context));
}
