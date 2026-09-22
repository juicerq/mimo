import type { AgentMessage } from "@earendil-works/pi-agent-core";

const CUT = "Interrompido: o mimo fechou antes desta ação terminar, então ela pode ou não ter acontecido.";

export interface TranscriptRow { id: string; message: AgentMessage }

export function unansweredCalls(rows: TranscriptRow[]): TranscriptRow[] {
	const answered = new Set(rows.map((row) => row.id));
	return rows.flatMap((row) => row.message.role === "assistant" ? row.message.content.flatMap((part, index) => {
		const id = `result:${row.id}:${index}`;
		if (part.type !== "toolCall" || answered.has(id)) {
			return [];
		}
		const message: AgentMessage = {
			role: "toolResult", toolCallId: part.id, toolName: part.name,
			content: [{ type: "text", text: JSON.stringify({ warning: CUT }) }],
			isError: false, timestamp: row.message.timestamp,
		};
		return [{ id, message }];
	}) : []);
}

export function orderTranscript(rows: TranscriptRow[]): AgentMessage[] {
	const results = new Map(rows.filter((row) => row.message.role === "toolResult").map((row) => [row.id, row.message]));
	const referenced = new Set(rows.flatMap((row) => row.message.role === "assistant" ? row.message.content.flatMap((part, index) => part.type === "toolCall" ? [`result:${row.id}:${index}`] : []) : []));
	const ordered: AgentMessage[] = [];
	for (const row of rows) {
		if (row.message.role === "toolResult" && referenced.has(row.id)) {
			continue;
		}
		ordered.push(row.message);
		if (row.message.role === "assistant") {
			for (const [index, part] of row.message.content.entries()) {
				const result = results.get(`result:${row.id}:${index}`);
				if (part.type === "toolCall" && result) {
					ordered.push(result);
				}
			}
		}
	}
	return ordered;
}
