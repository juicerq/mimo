import { defineChannel, GET, POST } from "eve/channels";
import { z } from "zod";
import { BotNameSchema } from "../bots";
import { sendBotMessage } from "../lib/bot-session";
import { createBot, getBot, listBots, updateBot } from "../lib/bots";
import { selectModel } from "../model";
import { ModelSelectionSchema } from "../model-info";

const CreateBotSchema = z.object({ name: BotNameSchema });
const MessageSchema = z.object({ message: z.string().trim().min(1) });

export default defineChannel({
	turnPolicy: "queue",
	routes: [
		GET("/mimo/bots", async () => Response.json(await listBots())),
		POST("/mimo/bots", async (request) => {
			const parsed = CreateBotSchema.safeParse(await request.json());
			if (!parsed.success) {
				return Response.json({ error: "Use a name with 1–80 visible characters." }, { status: 400 });
			}
			return Response.json(await createBot(parsed.data.name), { status: 201 });
		}),
		GET("/mimo/bots/:id", async (_request, { params }) => {
			const id = z.uuid().safeParse(params["id"]);
			const bot = id.success ? await getBot(id.data) : null;
			return Response.json(bot, { status: bot ? 200 : 404 });
		}),
		POST("/mimo/bots/:id/model", async (request, { params }) => {
			const id = z.uuid().safeParse(params["id"]);
			const parsed = ModelSelectionSchema.safeParse(await request.json());
			if (!id.success || !parsed.success) {
				return Response.json({ error: "Invalid model selection." }, { status: 400 });
			}
			const model = await selectModel(parsed.data).catch((error: unknown) => {
				if (error instanceof Error) {
					return error;
				}
				return new Error("Could not select this model.");
			});
			if (model instanceof Error) {
				return Response.json({ error: model.message }, { status: 400 });
			}
			const bot = await updateBot(id.data, async (current) => ({ ...current, model }));
			return Response.json(bot, { status: bot ? 200 : 404 });
		}),
		POST("/mimo/bots/:id/messages", async (request, channel) => {
			const id = z.uuid().safeParse(channel.params["id"]);
			const parsed = MessageSchema.safeParse(await request.json());
			if (!id.success || !parsed.success) {
				return Response.json({ error: "Invalid bot or message." }, { status: 400 });
			}
			const bot = await sendBotMessage({ id: id.data, message: parsed.data.message }, channel);
			return Response.json(bot, { status: bot ? 200 : 404 });
		}),
	],
});
