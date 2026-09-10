import { z } from "zod";
import { accessToken, type GmailAccount } from "./accounts";

const API_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_BODY_CHARS = 6_000;
const MAX_THREAD_MESSAGES = 20;

const headerSchema = z.object({ name: z.string(), value: z.string() });

const profileSchema = z.object({
	emailAddress: z.string().min(1),
});

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

const draftSchema = z.object({
	id: z.string(),
	message: z.object({ id: z.string(), threadId: z.string().optional() }).optional(),
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
	account: string;
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
	account: string;
	threadId: string;
	subject: string | null;
	messages: ThreadMessage[];
	omittedMessages: number;
}

async function requestWithToken<T>(
	token: string,
	path: string,
	schema: z.ZodType<T>,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(`${API_URL}${path}`, {
		...init,
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
	});
	if (!response.ok) {
		throw new Error(`O Gmail respondeu ${response.status}: ${(await response.text()).slice(0, 300)}`);
	}
	return schema.parse(await response.json());
}

async function gmailRequest<T>(
	account: GmailAccount,
	path: string,
	schema: z.ZodType<T>,
	init?: RequestInit,
): Promise<T> {
	return requestWithToken(await accessToken(account), path, schema, init);
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

async function fetchHeader(account: GmailAccount, reference: { id: string; threadId: string }): Promise<UnreadEmail> {
	const params = new URLSearchParams({ format: "metadata" });
	for (const name of ["From", "Subject", "Date"]) {
		params.append("metadataHeaders", name);
	}
	const message = await gmailRequest(
		account,
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

export async function listUnread(account: GmailAccount, limit: number): Promise<UnreadList> {
	const params = new URLSearchParams({ q: "is:unread in:inbox", maxResults: String(limit) });
	const list = await gmailRequest(account, `/messages?${params.toString()}`, messageListSchema);
	return {
		account: account.email,
		estimatedTotal: list.resultSizeEstimate ?? null,
		emails: await Promise.all((list.messages ?? []).map((reference) => fetchHeader(account, reference))),
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

export async function readThread(account: GmailAccount, threadId: string): Promise<Thread> {
	const thread = await gmailRequest(account, `/threads/${encodeURIComponent(threadId)}?format=full`, threadSchema);
	const messages = thread.messages ?? [];
	const kept = messages.slice(-MAX_THREAD_MESSAGES);
	return {
		account: account.email,
		threadId: thread.id,
		subject: headerValue(messages.at(0)?.payload?.headers, "Subject"),
		messages: kept.map(toThreadMessage),
		omittedMessages: messages.length - kept.length,
	};
}

export async function fetchAccountEmail(token: string): Promise<string> {
	const profile = await requestWithToken(token, "/profile", profileSchema);
	return profile.emailAddress;
}

export interface DraftRequest {
	account: GmailAccount;
	body: string;
	threadId?: string;
	to?: string;
	cc?: string;
	subject?: string;
}

export interface CreatedDraft {
	account: string;
	draftId: string;
	threadId: string | null;
	to: string;
	subject: string;
}

export interface SentDraft {
	account: string;
	messageId: string;
	to: string | null;
	subject: string | null;
}

function headerText(headers: z.infer<typeof headerSchema>[] | undefined, name: string): string | undefined {
	return firstText(headerValue(headers, name) ?? undefined);
}

function safeHeader(value: string): string {
	return value.replace(/[\r\n]+/g, " ").trim();
}

function mime(details: { to: string; cc?: string; subject: string; body: string; inReplyTo?: string }): string {
	const headers = [
		`To: ${safeHeader(details.to)}`,
		details.cc ? `Cc: ${safeHeader(details.cc)}` : "",
		`Subject: ${safeHeader(details.subject)}`,
		details.inReplyTo ? `In-Reply-To: ${safeHeader(details.inReplyTo)}` : "",
		details.inReplyTo ? `References: ${safeHeader(details.inReplyTo)}` : "",
		"Content-Type: text/plain; charset=utf-8",
		"MIME-Version: 1.0",
	].filter(Boolean);
	return Buffer.from([...headers, "", details.body].join("\r\n")).toString("base64url");
}

interface Envelope {
	to: string;
	subject: string;
	cc?: string;
	inReplyTo?: string;
}

function newEnvelope(request: DraftRequest): Envelope {
	if (!request.to || !request.subject) {
		throw new Error("Para um rascunho novo, informe to e subject; para responder, informe threadId.");
	}
	return { to: request.to, subject: request.subject, cc: request.cc };
}

function replySubject(subject: string | undefined): string | undefined {
	if (!subject) {
		return undefined;
	}
	if (/^re:/i.test(subject)) {
		return subject;
	}
	return `Re: ${subject}`;
}

async function replyEnvelope(request: DraftRequest, threadId: string): Promise<Envelope> {
	const params = new URLSearchParams({ format: "metadata" });
	for (const name of ["From", "Reply-To", "Subject", "Message-ID"]) {
		params.append("metadataHeaders", name);
	}
	const thread = await gmailRequest(
		request.account,
		`/threads/${encodeURIComponent(threadId)}?${params.toString()}`,
		threadSchema,
	);
	const headers = thread.messages?.at(-1)?.payload?.headers;
	const to = request.to ?? headerText(headers, "Reply-To") ?? headerText(headers, "From");
	const subject = request.subject ?? replySubject(headerText(headers, "Subject"));
	if (!to || !subject) {
		throw new Error(`A thread ${threadId} não tem destinatário ou assunto; informe to e subject.`);
	}
	return { to, subject, cc: request.cc, inReplyTo: headerText(headers, "Message-ID") };
}

export async function createDraft(request: DraftRequest): Promise<CreatedDraft> {
	const envelope = request.threadId ? await replyEnvelope(request, request.threadId) : newEnvelope(request);
	const draft = await gmailRequest(request.account, "/drafts", draftSchema, {
		method: "POST",
		body: JSON.stringify({
			message: {
				raw: mime({ ...envelope, body: request.body }),
				...(request.threadId ? { threadId: request.threadId } : {}),
			},
		}),
	});
	return {
		account: request.account.email,
		draftId: draft.id,
		threadId: draft.message?.threadId ?? request.threadId ?? null,
		to: envelope.to,
		subject: envelope.subject,
	};
}

export async function sendDraft(account: GmailAccount, draftId: string): Promise<SentDraft> {
	const sent = await gmailRequest(account, "/drafts/send", messageSchema, {
		method: "POST",
		body: JSON.stringify({ id: draftId }),
	});
	const delivered = await gmailRequest(
		account,
		`/messages/${encodeURIComponent(sent.id)}?format=metadata&metadataHeaders=To&metadataHeaders=Subject`,
		messageSchema,
	);
	return {
		account: account.email,
		messageId: sent.id,
		to: headerValue(delivered.payload?.headers, "To"),
		subject: headerValue(delivered.payload?.headers, "Subject"),
	};
}
