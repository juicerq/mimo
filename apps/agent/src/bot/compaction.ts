import { estimateContextTokens, estimateTokens, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { isLlmMessage } from "../messages";
import { models } from "../model/models";
import { entryMessage } from "./events";
import { withoutBorrowedReasoning } from "./reasoning";

export interface Compaction {
	crowded: string | null;
	dropped: AgentMessage[];
	messages: AgentMessage[];
	summary: string;
}

const COMPACT_AT = 0.8;
const KEEP_FRACTION = 0.25;
const CROWDED_AT = 0.5;
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

function promptTokens(systemPrompt: string): number {
	return estimateTokens({ role: "user", content: [{ type: "text", text: systemPrompt }], timestamp: 0 });
}

function crowdedText(floor: number, contextWindow: number): string | null {
	if (floor <= contextWindow * CROWDED_AT) {
		return null;
	}
	const share = `${Math.round(floor / 1_000)}k de ${Math.round(contextWindow / 1_000)}k`;
	return `As instruções permanentes deste bot ocupam ${share} da janela, então sobra pouco para a conversa.`;
}

export async function compactTranscript(input: { messages: AgentMessage[]; model: Model<Api>; systemPrompt: string; sessionId: string }): Promise<Compaction | null> {
	if (estimateContextTokens(input.messages).tokens < input.model.contextWindow * COMPACT_AT) {
		return null;
	}
	const floor = promptTokens(input.systemPrompt);
	const room = Math.max(0, input.model.contextWindow - floor);
	const cut = cutIndex(input.messages, room * KEEP_FRACTION);
	if (cut < 0) {
		return null;
	}
	const earlier = input.messages.slice(0, cut);
	const summary = await models().completeSimple(input.model, {
		systemPrompt: SUMMARY_PROMPT,
		messages: withoutBorrowedReasoning(earlier).filter(isLlmMessage),
	}, { sessionId: input.sessionId });
	if (summary.stopReason !== "stop") {
		throw new Error("O resumo da conversa não terminou.");
	}
	const text = summary.content.filter((part) => part.type === "text").map((part) => part.text).join("").trim();
	if (!text) {
		throw new Error("O modelo não devolveu um resumo da conversa.");
	}
	const summaryText = `Resumo da conversa anterior, compactada para caber no contexto:\n\n${text}`;
	const message = entryMessage({ kind: "summary", text: summaryText });
	if (estimateTokens(message) >= earlier.reduce((total, entry) => total + estimateTokens(entry), 0)) {
		throw new Error("O resumo ficou maior que a conversa que ele substitui.");
	}
	return { crowded: crowdedText(floor, input.model.contextWindow), dropped: earlier, messages: [message, ...input.messages.slice(cut)], summary: summaryText };
}
