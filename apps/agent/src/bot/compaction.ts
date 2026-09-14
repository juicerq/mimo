import { estimateContextTokens, estimateTokens, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { isLlmMessage } from "../messages";
import { models } from "../model/models";
import { entryMessage } from "./events";

export interface Compaction {
	dropped: AgentMessage[];
	messages: AgentMessage[];
}

const COMPACT_AT = 0.8;
const KEEP_FRACTION = 0.25;
const SUMMARY_PROMPT = "Você resume conversas. Leia a conversa e devolve um resumo estruturado em português com: objetivos da pessoa, decisões tomadas, fatos duráveis, trabalho em andamento e pendências. Não responda à conversa, só produza o resumo.";

function cutIndex(messages: AgentMessage[], budget: number): number {
	let kept = 0;
	let withinBudget = -1;
	let lastTurn = -1;
	for (let index = messages.length - 1; index > 0; index -= 1) {
		kept += estimateTokens(messages[index]);
		if (messages[index].role !== "user") {
			continue;
		}
		if (lastTurn < 0) {
			lastTurn = index;
		}
		if (kept <= budget) {
			withinBudget = index;
		}
	}
	if (withinBudget >= 0) {
		return withinBudget;
	}
	return lastTurn;
}

export async function compactTranscript(input: { messages: AgentMessage[]; model: Model<Api> }): Promise<Compaction | null> {
	if (estimateContextTokens(input.messages).tokens < input.model.contextWindow * COMPACT_AT) {
		return null;
	}
	const cut = cutIndex(input.messages, input.model.contextWindow * KEEP_FRACTION);
	if (cut < 0) {
		return null;
	}
	const earlier = input.messages.slice(0, cut);
	const summary = await models().completeSimple(input.model, {
		systemPrompt: SUMMARY_PROMPT,
		messages: earlier.filter(isLlmMessage),
	});
	if (summary.stopReason !== "stop") {
		return null;
	}
	const text = summary.content.filter((part) => part.type === "text").map((part) => part.text).join("").trim();
	if (!text) {
		return null;
	}
	const message = entryMessage({ kind: "summary", text: `Resumo da conversa anterior, compactada para caber no contexto:\n\n${text}` });
	if (estimateTokens(message) >= earlier.reduce((total, entry) => total + estimateTokens(entry), 0)) {
		return null;
	}
	return { dropped: earlier, messages: [message, ...input.messages.slice(cut)] };
}
