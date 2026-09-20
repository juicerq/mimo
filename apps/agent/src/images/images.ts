import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent } from "@earendil-works/pi-ai";
import { isLlmMessage } from "../messages";
import { writeBinaryFile } from "../storage/files";
import { dataPath } from "../storage/home";

const EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
};

const MIME_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
};

const MARK = /^\[imagem: (?<name>[a-f0-9]{16}\.[a-z]{3,4})\]\n/u;
const LOST = "[a imagem não está mais no disco]";

export interface Pasted {
	mimeType: string;
	data: string;
}

export function imageName(name: string): boolean {
	return MARK.test(`[imagem: ${name}]\n`);
}

export function imageFile(botId: string, name: string): string {
	return dataPath("bots", botId, "images", name);
}

export async function saveImage(botId: string, image: Pasted): Promise<string> {
	const extension = EXTENSIONS[image.mimeType];
	if (!extension) {
		throw new Error("Este tipo de imagem não entra na conversa.");
	}
	const bytes = Buffer.from(image.data, "base64");
	const name = `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.${extension}`;
	await writeBinaryFile(imageFile(botId, name), bytes);
	return name;
}

export function markImages(names: readonly string[], text: string): string {
	if (names.length === 0) {
		return text;
	}
	return [...names.map((name) => `[imagem: ${name}]`), text].join("\n");
}

export function splitImages(text: string): { names: string[]; text: string } {
	const names: string[] = [];
	let rest = text;
	let mark = MARK.exec(rest);
	while (mark?.groups) {
		names.push(mark.groups.name);
		rest = rest.slice(mark[0].length);
		mark = MARK.exec(rest);
	}
	return { names, text: rest };
}

async function imageContent(botId: string, name: string): Promise<ImageContent | null> {
	const mimeType = MIME_TYPES[name.split(".").at(-1) ?? ""];
	const bytes = mimeType ? await readFile(imageFile(botId, name)).catch(() => null) : null;
	if (!bytes) {
		return null;
	}
	return { type: "image", data: bytes.toString("base64"), mimeType };
}

async function pictured(botId: string, message: AgentMessage): Promise<AgentMessage> {
	if (!isLlmMessage(message) || message.role !== "user" || typeof message.content !== "string") {
		return message;
	}
	const pasted = splitImages(message.content);
	if (pasted.names.length === 0) {
		return message;
	}
	const parts = await Promise.all(pasted.names.map(async (name) => await imageContent(botId, name)));
	const found = parts.filter((part) => part !== null);
	if (found.length === 0) {
		return { ...message, content: pasted.text || LOST };
	}
	return { ...message, content: [...found, ...pasted.text ? [{ type: "text" as const, text: pasted.text }] : []] };
}

export async function withImages(botId: string, messages: AgentMessage[]): Promise<AgentMessage[]> {
	return await Promise.all(messages.map(async (message) => await pictured(botId, message)));
}
