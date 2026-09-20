import { z } from "zod";
import { PROVIDER_NAMES, type Provider } from "./types";

const STATUS_BODY = /^(\d{3}): ([\s\S]+)$/;
const NO_BALANCE = /insufficient balance|insufficient credit|quota/i;

const BodySchema = z.object({
	message: z.string().optional(),
	error: z.object({ message: z.string().optional() }).optional(),
});

export function modelFailure(raw: string, provider: Provider): string {
	const match = STATUS_BODY.exec(raw.trim());
	if (!match) {
		return raw;
	}
	const status = Number(match[1]);
	const detail = providerMessage(match[2] ?? "");
	return `${advice(status, detail, PROVIDER_NAMES[provider])} — ${detail}`;
}

function advice(status: number, detail: string, name: string): string {
	if (NO_BALANCE.test(detail)) {
		return `${name} has no balance left. Pick another provider in the bot panel, then continue the conversation.`;
	}
	if (status === 401 || status === 403) {
		return `${name} did not accept the credential. Connect it again in Settings, then continue the conversation.`;
	}
	if (status === 429) {
		return `${name} is limiting the requests. Wait a few seconds, then continue the conversation.`;
	}
	if (status >= 500) {
		return `${name} failed (${status}). Continue the conversation to try again.`;
	}
	return `${name} refused the request (${status}).`;
}

function providerMessage(body: string): string {
	const parsed = BodySchema.safeParse(json(body));
	return parsed.data?.error?.message ?? parsed.data?.message ?? body;
}

function json(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
