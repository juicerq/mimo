import { defineTool } from "eve/tools";
import { z } from "zod";
import { recordAction, recordFailure } from "../lib/actions";
import { accountField, resolveAccount } from "../lib/gmail/accounts";
import { sendDraft } from "../lib/gmail/api";
import { approveInNormalMode, botMode } from "../lib/mode";

export default defineTool({
	description: "Envia um rascunho existente do Gmail. No modo normal, a chamada espera aprovação no terminal.",
	inputSchema: z.object({
		account: accountField,
		draftId: z.string().min(1).describe("O id do rascunho, como veio de create_draft."),
	}),
	approval: approveInNormalMode,
	async execute({ account, draftId }, ctx) {
		const resolved = await resolveAccount(account);
		const base = {
			kind: "send_draft" as const,
			mode: botMode.get(),
			sessionId: ctx.session.id,
			account: resolved.email,
		};
		try {
			const sent = await sendDraft(resolved, draftId);
			await recordAction({
				...base,
				summary: `rascunho ${draftId} para ${sent.to ?? "destinatário ausente"}: ${sent.subject ?? "sem assunto"}`,
				detail: { messageId: sent.messageId, draftId },
			});
			return sent;
		} catch (error) {
			await recordFailure({ ...base, summary: `rascunho ${draftId}` }, error).catch(() => {});
			throw error;
		}
	},
});
