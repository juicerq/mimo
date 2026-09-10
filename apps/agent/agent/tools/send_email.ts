import { defineTool } from "eve/tools";
import { z } from "zod";
import { recordAction, recordFailure } from "../lib/actions";
import { accountField, resolveAccount } from "../lib/gmail/accounts";
import { sendEmail } from "../lib/gmail/api";
import { approveInNormalMode, botMode } from "../lib/mode";

export default defineTool({
	description:
		"Envia um e-mail novo. No modo normal, a chamada espera aprovação no terminal; no modo autônomo, envia sem perguntar e registra a ação.",
	inputSchema: z.object({
		account: accountField,
		to: z.string().min(1).describe("Destinatários separados por vírgula."),
		cc: z.string().min(1).optional().describe("Destinatários em cópia, separados por vírgula."),
		subject: z.string().min(1).describe("Assunto."),
		body: z.string().min(1).describe("Corpo do e-mail em texto puro."),
	}),
	approval: approveInNormalMode,
	async execute({ account, ...email }, ctx) {
		const resolved = await resolveAccount(account);
		const input = {
			kind: "send_email" as const,
			mode: botMode.get(),
			sessionId: ctx.session.id,
			account: resolved.email,
			summary: `para ${email.to}: ${email.subject}`,
		};
		try {
			const sent = await sendEmail({ account: resolved, ...email });
			await recordAction({
				...input,
				detail: { messageId: sent.messageId, threadId: sent.threadId },
			});
			return sent;
		} catch (error) {
			await recordFailure(input, error).catch(() => {});
			throw error;
		}
	},
});
