import { memo, useEffect, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Conversation, Line, Turn } from "./conversation";

export const DETAIL_LEVELS = ["off", "brief", "full"] as const;

export type Detail = (typeof DETAIL_LEVELS)[number];

const NEEDS: Record<Line["kind"], Detail> = { you: "off", reply: "off", note: "off", detail: "brief", result: "full" };
const DETAIL_CHARACTERS = 600;
const TURN_LABELS: Record<Turn, string | null> = { idle: null, thinking: "pensando", working: "trabalhando", waiting: "esperando aprovação" };
const PLUGINS = [remarkGfm];
const COMPONENTS: Components = {
	a: ({ href, children }) => (
		<a href={href} target="_blank" rel="noreferrer">
			{children}
		</a>
	),
};

function shows(level: Detail, need: Detail): boolean {
	return DETAIL_LEVELS.indexOf(level) >= DETAIL_LEVELS.indexOf(need);
}

function truncate(text: string): string {
	if (text.length <= DETAIL_CHARACTERS) {
		return text;
	}
	return `${text.slice(0, DETAIL_CHARACTERS)}…`;
}

function Reply({ name, text }: { name: string; text: string }) {
	return (
		<div className="line reply">
			<p className="who">{name}:</p>
			<Markdown remarkPlugins={PLUGINS} components={COMPONENTS}>
				{text}
			</Markdown>
		</div>
	);
}

const LineView = memo(function LineView({ line, level, name }: { line: Line; level: Detail; name: string }) {
	switch (line.kind) {
		case "you":
			return (
				<p className="line you">
					<span className="who">you: </span>
					{line.text}
				</p>
			);
		case "reply":
			return <Reply name={name} text={line.text} />;
		case "note":
			return <p className={`line ${line.tone}`}>{line.text}</p>;
		case "detail":
			return (
				<div className={`line ${line.tone}`}>
					<p>{line.text}</p>
					{line.extra && level === "full" && <p className="extra">{truncate(line.extra)}</p>}
				</div>
			);
		case "result":
			return <p className="line extra">{truncate(line.text)}</p>;
		default: {
			const _exhaustive: never = line;
			return _exhaustive;
		}
	}
});

const Lines = memo(function Lines({ lines, level, name }: { lines: Line[]; level: Detail; name: string }) {
	return lines.map((line, index) => shows(level, NEEDS[line.kind]) && <LineView key={index} line={line} level={level} name={name} />);
});

function Status({ label }: { label: string }) {
	const [startedAt] = useState(() => Date.now());
	const [now, setNow] = useState(startedAt);

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	return (
		<p className="line quiet">
			<span className="spinner" /> {label} · {Math.floor((now - startedAt) / 1000)}s
		</p>
	);
}

export function Transcript({ conversation, level, name }: { conversation: Conversation; level: Detail; name: string }) {
	const label = TURN_LABELS[conversation.turn];

	return (
		<div className="lines">
			<div>
				<Lines lines={conversation.lines} level={level} name={name} />
				{conversation.streaming && <Reply name={name} text={conversation.streaming} />}
				{label && <Status label={label} />}
				{conversation.queue.map((item, index) => (
					<p key={index} className="line quiet">
						na fila: {item}
					</p>
				))}
			</div>
		</div>
	);
}
