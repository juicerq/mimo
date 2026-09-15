import type { AgentMessage } from "@earendil-works/pi-agent-core";

const OWN_CALLER = "openai-codex";

export function withoutBorrowedReasoning(messages: AgentMessage[]): AgentMessage[] {
	return messages.map(stripBorrowed);
}

function stripBorrowed(message: AgentMessage): AgentMessage {
	if (message.role !== "assistant" || message.api !== "openai-responses" || message.provider === OWN_CALLER) {
		return message;
	}
	const content = message.content
		.map((block) => (block.type === "thinking" ? { ...block, thinkingSignature: undefined } : block))
		.filter((block) => block.type !== "thinking" || block.thinking.trim() !== "");
	return { ...message, content };
}
