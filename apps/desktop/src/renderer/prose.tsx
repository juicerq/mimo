import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const PLUGINS = [remarkGfm];
const COMPONENTS: Components = {
	a: ({ href, children }) => (
		<a href={href} target="_blank" rel="noreferrer">
			{children}
		</a>
	),
};
const FENCE = /^\s*(`{3,}|~{3,})/u;
const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])(?:\s|$)/u;
const UNINDENTED = /^\S/u;

function fenceAfter(open: string | null, line: string): string | null {
	const marker = FENCE.exec(line)?.[1];
	if (!marker) {
		return open;
	}
	if (open === null) {
		return marker;
	}
	if (marker.startsWith(open) && line.trim() === marker) {
		return null;
	}
	return open;
}

function blocksOf(text: string): string[] {
	const blocks: string[] = [];
	let lines: string[] = [];
	let fence: string | null = null;
	let listed = false;
	let gap = false;

	for (const line of text.split("\n")) {
		const item = LIST_ITEM.test(line);
		if (gap && fence === null && UNINDENTED.test(line) && !(item && listed)) {
			blocks.push(lines.join("\n"));
			lines = [];
			listed = false;
		}
		fence = fenceAfter(fence, line);
		listed ||= item && fence === null;
		gap = line.trim() === "";
		lines.push(line);
	}
	blocks.push(lines.join("\n"));

	return blocks;
}

export const Prose = memo(function Prose({ text }: { text: string }) {
	return (
		<Markdown remarkPlugins={PLUGINS} components={COMPONENTS}>
			{text}
		</Markdown>
	);
});

export function StreamingProse({ text }: { text: string }) {
	return blocksOf(text).map((block, index) => <Prose key={index} text={block} />);
}
