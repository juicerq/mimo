import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";

export function isLlmMessage(message: AgentMessage): message is Message {
	return message.role === "user" || message.role === "assistant" || message.role === "toolResult";
}

export function contentText(content: Message["content"]): string {
	if (typeof content === "string") {
		return content;
	}
	return content.filter((part) => part.type === "text").map((part) => part.text).join("");
}
