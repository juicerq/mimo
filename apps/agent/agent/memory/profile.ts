import { defineMemory } from "eve/memory";
import { fileMemory } from "eve/memory/file";
import { localMemoryBackend } from "../memory-backend";
import { botIdFromToken, getBot } from "../lib/bots";

export default defineMemory({
	description: "Guarda fatos, preferências e decisões duráveis desta conversa.",
	namespace: "mimo.bot",
	provider: fileMemory({ backend: localMemoryBackend() }),
	scope: async (ctx) => {
		const bot = await getBot(botIdFromToken(ctx.channel.continuationToken));
		if (!bot) {
			throw new Error("The bot for this memory no longer exists.");
		}
		return bot.memorySessionId ?? bot.sessionId ?? ctx.session.id;
	},
});
