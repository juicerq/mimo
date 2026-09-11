import { z } from "zod";
import { ModelInfoSchema } from "./model-info";

export const BotNameSchema = z.string().trim().min(1).max(80).regex(/^[^\p{Cc}\p{Cf}]+$/u);

export const BotSchema = z.object({
	id: z.uuid(),
	name: BotNameSchema,
	sessionId: z.string().min(1).nullable(),
	previousSessionId: z.string().min(1).nullable().default(null),
	memorySessionId: z.string().min(1).nullable().default(null),
	createdAt: z.iso.datetime(),
	model: ModelInfoSchema,
});

export const BotsSchema = z.array(BotSchema);

export type Bot = z.infer<typeof BotSchema>;
