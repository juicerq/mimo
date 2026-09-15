import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { isLlmMessage } from "../messages";

const CUT = "Interrompido: o mimo fechou antes desta ação terminar, então ela pode ou não ter acontecido.";

function answeredCalls(log: AgentMessage[]): Set<string> {
	const answered = new Set<string>();
	for (const message of log) {
		if (isLlmMessage(message) && message.role === "toolResult") {
			answered.add(message.toolCallId);
		}
	}
	return answered;
}

function missingResults(content: AssistantMessage["content"], answered: Set<string>, timestamp: number): AgentMessage[] {
	return content.filter((part) => part.type === "toolCall").filter((part) => !answered.has(part.id)).map((part) => cutResult(part, timestamp));
}

function cutResult(call: { id: string; name: string }, timestamp: number): AgentMessage {
	return {
		role: "toolResult",
		toolCallId: call.id,
		toolName: call.name,
		content: [{ type: "text", text: JSON.stringify({ warning: CUT }) }],
		isError: false,
		timestamp,
	};
}

export function sealTranscript(log: AgentMessage[]): AgentMessage[] {
	const answered = answeredCalls(log);
	const sealed: AgentMessage[] = [];
	const pending: AgentMessage[] = [];
	for (const message of log) {
		if (!isLlmMessage(message) || message.role !== "toolResult") {
			sealed.push(...pending.splice(0));
		}
		sealed.push(message);
		if (isLlmMessage(message) && message.role === "assistant") {
			pending.push(...missingResults(message.content, answered, message.timestamp));
		}
	}
	return [...sealed, ...pending];
}
