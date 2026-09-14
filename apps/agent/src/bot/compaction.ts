import { estimateContextTokens, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { isLlmMessage } from "../messages";
import { models } from "../model/models";
import { entryMessage } from "./events";

const COMPACT_AT = 0.8;
const KEEP_RECENT_MESSAGES = 8;
const SUMMARY_PROMPT = "Você resume conversas. Leia a conversa e devolve um resumo estruturado em português com: objetivos da pessoa, decisões tomadas, fatos duráveis, trabalho em andamento e pendências. Não responda à conversa, só produza o resumo.";

function cutIndex(messages: AgentMessage[]): number {
	for (let index = messages.length - KEEP_RECENT_MESSAGES; index > 0; index -= 1) {
		if (messages[index].role === "user") {
			return index;
		}
	}
	return -1;
}

export async function compactTranscript(input: { messages: AgentMessage[]; model: Model<Api> }): Promise<AgentMessage[] | null> {
	if (estimateContextTokens(input.messages).tokens < input.model.contextWindow * COMPACT_AT) {
		return null;
	}
	const cut = cutIndex(input.messages);
	if (cut < 0) {
		return null;
	}
	const summary = await models().completeSimple(input.model, {
		systemPrompt: SUMMARY_PROMPT,
		messages: input.messages.slice(0, cut).filter(isLlmMessage),
	});
	const text = summary.content.filter((part) => part.type === "text").map((part) => part.text).join("");
	if (!text) {
		return null;
	}
	const message = entryMessage({ kind: "summary", text: `Resumo da conversa anterior, compactada para caber no contexto:\n\n${text}` });
	return [message, ...input.messages.slice(cut)];
}
