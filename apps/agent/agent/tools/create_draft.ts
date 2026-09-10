import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveAccount } from "../lib/gmail/accounts";
import { createDraft } from "../lib/gmail/api";

export default defineTool({
	description:
		"Cria um rascunho no Gmail sem enviar nada. Para responder, informe threadId e o corpo; to e subject são derivados da thread.",
	inputSchema: z.object({
		account: z.string().optional().describe("E-mail da conta conectada. Use list_accounts para ver as opções."),
		threadId: z.string().min(1).optional().describe("Thread a responder, como veio de list_unread ou read_thread."),
		to: z.string().min(1).optional().describe("Destinatários separados por vírgula. Obrigatório em rascunho novo."),
		cc: z.string().min(1).optional().describe("Destinatários em cópia, separados por vírgula."),
		subject: z.string().min(1).optional().describe("Assunto. Obrigatório em rascunho novo."),
		body: z.string().min(1).describe("Corpo do rascunho em texto puro."),
	}),
	async execute({ account, ...draft }) {
		return createDraft({ account: await resolveAccount(account), ...draft });
	},
});
