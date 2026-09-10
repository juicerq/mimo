import { defineTool } from "eve/tools";
import { z } from "zod";
import { accountField, resolveAccount } from "../lib/gmail/accounts";
import { sendDraft } from "../lib/gmail/api";
import { approveInNormalMode } from "../lib/mode";

export default defineTool({
	description: "Envia um rascunho existente do Gmail. No modo normal, a chamada espera aprovação no terminal.",
	inputSchema: z.object({
		account: accountField,
		draftId: z.string().min(1).describe("O id do rascunho, como veio de create_draft."),
	}),
	approval: approveInNormalMode,
	async execute({ account, draftId }) {
		return sendDraft(await resolveAccount(account), draftId);
	},
});
