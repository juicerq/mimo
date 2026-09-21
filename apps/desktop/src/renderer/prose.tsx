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

export const Prose = memo(function Prose({ text }: { text: string }) {
	return (
		<Markdown remarkPlugins={PLUGINS} components={COMPONENTS}>
			{text}
		</Markdown>
	);
});
