import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveAccount } from "../lib/gmail/accounts";
import { sendDraft } from "../lib/gmail/api";
import { approveInNormalMode } from "../lib/mode";

export default defineTool({
	description: "Envia um rascunho existente do Gmail. No modo normal, a chamada espera aprovação no terminal.",
	inputSchema: z.object({
		account: z.string().optional().describe("E-mail da conta conectada. Use list_accounts para ver as opções."),
		draftId: z.string().min(1).describe("O id do rascunho, como veio de create_draft."),
	}),
	approval: approveInNormalMode,
	async execute({ account, draftId }) {
		return sendDraft(await resolveAccount(account), draftId);
	},
});
