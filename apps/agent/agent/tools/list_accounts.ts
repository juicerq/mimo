import { defineTool } from "eve/tools";
import { z } from "zod";
import { listAccounts } from "../lib/gmail/accounts";

export default defineTool({
	description: "Lista os endereços das contas de Gmail conectadas.",
	inputSchema: z.object({}),
	async execute() {
		const accounts = await listAccounts();
		return { accounts: accounts.map((account) => account.email) };
	},
});
