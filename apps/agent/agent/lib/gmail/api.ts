import { z } from "zod";
import { gmailAccessToken } from "./oauth";

const API_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_BODY_CHARS = 6_000;
const MAX_THREAD_MESSAGES = 20;

const headerSchema = z.object({ name: z.string(), value: z.string() });

interface GmailPart {
	mimeType?: string;
	headers?: z.infer<typeof headerSchema>[];
	body?: { data?: string };
	parts?: GmailPart[];
}

const partSchema: z.ZodType<GmailPart> = z.lazy(() =>
	z.object({
		mimeType: z.string().optional(),
		headers: z.array(headerSchema).optional(),
		body: z.object({ data: z.string().optional() }).optional(),
		parts: z.array(partSchema).optional(),
	}),
);

const messageSchema = z.object({
	id: z.string(),
	threadId: z.string(),
	snippet: z.string().optional(),
	payload: partSchema.optional(),
});

const messageListSchema = z.object({
	messages: z.array(z.object({ id: z.string(), threadId: z.string() })).optional(),
	resultSizeEstimate: z.number().optional(),
});

const threadSchema = z.object({
	id: z.string(),
	messages: z.array(messageSchema).optional(),
});

interface UnreadEmail {
	id: string;
	threadId: string;
	from: string | null;
	subject: string | null;
	date: string | null;
	snippet: string | null;
}

interface UnreadList {
	estimatedTotal: number | null;
	emails: UnreadEmail[];
}

interface ThreadMessage {
	id: string;
	from: string | null;
	to: string | null;
	date: string | null;
	body: string;
}

interface Thread {
	threadId: string;
	subject: string | null;
	messages: ThreadMessage[];
	omittedMessages: number;
}

async function gmailGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
	const token = await gmailAccessToken();
	const response = await fetch(`${API_URL}${path}`, {
		headers: { authorization: `Bearer ${token}` },
	});
	if (!response.ok) {
		throw new Error(`O Gmail respondeu ${response.status}: ${(await response.text()).slice(0, 300)}`);
	}
	return schema.parse(await response.json());
}

function headerValue(headers: z.infer<typeof headerSchema>[] | undefined, name: string): string | null {
	const wanted = name.toLowerCase();
	const header = headers?.find((candidate) => candidate.name.toLowerCase() === wanted);
	return header?.value ?? null;
}

function firstText(...values: (string | undefined)[]): string | undefined {
	return values.find((value) => value !== undefined && value.trim() !== "");
}

function truncate(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max)}\n[... truncado em ${max} caracteres]`;
}

function htmlToText(html: string): string {
	return html
		.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&amp;/gi, "&")
		.replace(/[ \t]+/g, " ")
		.replace(/\s*\n\s*/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function findPart(part: GmailPart, mimeType: string): string | undefined {
	if (part.mimeType === mimeType && part.body?.data) {
		const text = Buffer.from(part.body.data, "base64url").toString("utf8");
		if (text.trim() !== "") {
			return text;
		}
	}
	for (const child of part.parts ?? []) {
		const found = findPart(child, mimeType);
		if (found !== undefined) {
			return found;
		}
	}
	return undefined;
}

function messageBody(message: z.infer<typeof messageSchema>): string {
	const payload = message.payload;
	const plain = payload ? findPart(payload, "text/plain") : undefined;
	const html = payload ? findPart(payload, "text/html") : undefined;
	const htmlText = html ? htmlToText(html) : undefined;
	const text = firstText(plain, htmlText, message.snippet);
	return truncate(text ?? "(corpo vazio)", MAX_BODY_CHARS);
}

async function fetchHeader(reference: { id: string; threadId: string }): Promise<UnreadEmail> {
	const params = new URLSearchParams({ format: "metadata" });
	for (const name of ["From", "Subject", "Date"]) {
		params.append("metadataHeaders", name);
	}
	const message = await gmailGet(
		`/messages/${encodeURIComponent(reference.id)}?${params.toString()}`,
		messageSchema,
	);
	const headers = message.payload?.headers;
	return {
		id: reference.id,
		threadId: reference.threadId,
		from: headerValue(headers, "From"),
		subject: headerValue(headers, "Subject"),
		date: headerValue(headers, "Date"),
		snippet: message.snippet ?? null,
	};
}

export async function listUnread(limit: number): Promise<UnreadList> {
	const params = new URLSearchParams({ q: "is:unread in:inbox", maxResults: String(limit) });
	const list = await gmailGet(`/messages?${params.toString()}`, messageListSchema);
	return {
		estimatedTotal: list.resultSizeEstimate ?? null,
		emails: await Promise.all((list.messages ?? []).map(fetchHeader)),
	};
}

function toThreadMessage(message: z.infer<typeof messageSchema>): ThreadMessage {
	const headers = message.payload?.headers;
	return {
		id: message.id,
		from: headerValue(headers, "From"),
		to: headerValue(headers, "To"),
		date: headerValue(headers, "Date"),
		body: messageBody(message),
	};
}

export async function readThread(threadId: string): Promise<Thread> {
	const thread = await gmailGet(`/threads/${encodeURIComponent(threadId)}?format=full`, threadSchema);
	const messages = thread.messages ?? [];
	const kept = messages.slice(-MAX_THREAD_MESSAGES);
	return {
		threadId: thread.id,
		subject: headerValue(messages.at(0)?.payload?.headers, "Subject"),
		messages: kept.map(toThreadMessage),
		omittedMessages: messages.length - kept.length,
	};
}
