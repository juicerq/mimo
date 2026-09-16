import { createClipboard, createHostClipboard, createRendererClipboardAdapter, decodePasteBytes, stripAnsiSequences, type CliRenderer, type ClipboardReadResult, type ClipboardService } from "@opentui/core";
import { describeError } from "./errors";

const COMMANDS = [
	["wl-copy"],
	["xclip", "-selection", "clipboard"],
	["xsel", "--clipboard", "--input"],
	["pbcopy"],
];

async function runCommand(command: string[], text: string): Promise<boolean> {
	const [name, ...args] = command;
	if (!name || !Bun.which(name)) {
		return false;
	}
	const copier = Bun.spawn([name, ...args], {
		stdin: new TextEncoder().encode(text),
		stdout: "ignore",
		stderr: "ignore",
	});
	return await copier.exited === 0;
}

export async function copyToClipboard(text: string): Promise<void> {
	for (const command of COMMANDS) {
		if (await runCommand(command, text).catch(() => false)) {
			return;
		}
	}
	const payload = Buffer.from(text, "utf8").toString("base64");
	process.stdout.write(`\u001b]52;c;${payload}\u0007`);
}

interface PastedImage {
	readonly bytes: Uint8Array;
	readonly mimeType: string;
}

export function pasteText(bytes: Uint8Array): string {
	return stripAnsiSequences(decodePasteBytes(bytes));
}

let clipboard: ClipboardService | null = null;

function clipboardService(renderer: CliRenderer): ClipboardService {
	if (!clipboard) {
		clipboard = createClipboard({
			host: createHostClipboard(),
			terminal: createRendererClipboardAdapter({
				capabilities: renderer.capabilities,
				copyToClipboardOSC52: (text) => renderer.copyToClipboardOSC52(text),
				clearClipboardOSC52: () => renderer.clearClipboardOSC52(),
			}),
		});
	}
	return clipboard;
}

export type ClipboardImageFailure =
	| { readonly kind: "empty" }
	| { readonly kind: "unsupported" }
	| { readonly kind: "cancelled" }
	| { readonly kind: "timed-out" }
	| { readonly kind: "limit-exceeded" }
	| { readonly kind: "failed"; readonly message: string };

export type ClipboardImageResult = { readonly image: PastedImage } | { readonly failure: ClipboardImageFailure };

export async function readClipboardImage(renderer: CliRenderer): Promise<ClipboardImageResult> {
	const result: ClipboardReadResult = await clipboardService(renderer).read({
		preferredTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
		signal: AbortSignal.timeout(5000),
	});
	if (result.status === "read") {
		const mimeType = result.representation.mimeType.split(";")[0]?.trim() ?? "";
		if (mimeType.startsWith("image/") && result.representation.bytes.length > 0) {
			return { image: { bytes: result.representation.bytes.slice(), mimeType } };
		}
		return { failure: { kind: "empty" } };
	}
	if (result.status === "failed") {
		return { failure: { kind: "failed", message: describeError(result.error) } };
	}
	return { failure: { kind: result.status } };
}

export function describeClipboardImageFailure(failure: ClipboardImageFailure): string {
	switch (failure.kind) {
		case "empty":
			return "clipboard has no image (empty or text-only)";
		case "unsupported":
			return "clipboard image read unsupported on this terminal";
		case "cancelled":
			return "clipboard image read cancelled";
		case "timed-out":
			return "clipboard image read timed out";
		case "limit-exceeded":
			return "clipboard image exceeds the size limit";
		case "failed":
			return `clipboard image read failed: ${failure.message}`;
	}
}
