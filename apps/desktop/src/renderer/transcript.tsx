import { CheckIcon, ClockIcon, ExclamationTriangleIcon, PauseCircleIcon, StopIcon, UserGroupIcon, WrenchScrewdriverIcon, XCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Fragment, memo, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Avatar } from "./avatar";
import type { Conversation, Line, ToolResult } from "./conversation";

export const DETAIL_LEVELS = ["off", "brief", "full"] as const;

export type Detail = (typeof DETAIL_LEVELS)[number];

export const DETAIL_NAMES: Record<Detail, string> = { off: "Oculto", brief: "Breve", full: "Completo" };

const NEEDS: Record<Line["kind"], Detail> = {
	you: "off",
	reply: "off",
	summary: "off",
	approval: "off",
	warning: "off",
	error: "off",
	stopped: "off",
	routine: "brief",
	team: "brief",
	note: "brief",
	tools: "brief",
	tool: "full",
};
const TEAM_VERBS = { created: "Criou", delegated: "Delegou para", stopped: "Parou", deleted: "Apagou" } as const;
const DETAIL_CHARACTERS = 600;
const PLUGINS = [remarkGfm];
const COMPONENTS: Components = {
	a: ({ href, children }) => (
		<a href={href} target="_blank" rel="noreferrer">
			{children}
		</a>
	),
};

function needOf(line: Line): Detail {
	if (line.kind === "team" && line.call.kind === "created") {
		return "full";
	}
	return NEEDS[line.kind];
}

function shows(level: Detail, need: Detail): boolean {
	return DETAIL_LEVELS.indexOf(level) >= DETAIL_LEVELS.indexOf(need);
}

function truncate(text: string): string {
	if (text.length <= DETAIL_CHARACTERS) {
		return text;
	}
	return `${text.slice(0, DETAIL_CHARACTERS)}…`;
}

function valueText(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value) ?? "";
}

function fields(input: unknown): [string, string][] {
	if (!input || typeof input !== "object") {
		return [];
	}
	return Object.entries(input).map(([key, value]) => [key, truncate(valueText(value))]);
}

function gist(input: unknown): string {
	const first = fields(input)[0]?.[1] ?? "";
	return first.replace(/^https?:\/\//u, "").replaceAll(/\s+/gu, " ");
}

function Fields({ input }: { input: unknown }) {
	const rows = fields(input);
	if (rows.length === 0) {
		return null;
	}
	return (
		<dl>
			{rows.map(([key, value]) => (
				<Fragment key={key}>
					<dt>{key}</dt>
					<dd>{value}</dd>
				</Fragment>
			))}
		</dl>
	);
}

function EventLine({ tone, icon, head, children }: { tone?: "warn" | "err"; icon: ReactNode; head: ReactNode; children?: ReactNode }) {
	return (
		<div className="event" data-tone={tone}>
			<div className="event-head">
				{icon}
				{head}
			</div>
			{children}
		</div>
	);
}

function Reply({ text }: { text: string }) {
	return (
		<div className="msg reply">
			<Markdown remarkPlugins={PLUGINS} components={COMPONENTS}>
				{text}
			</Markdown>
		</div>
	);
}

function Tool({ name, input, result }: { name: string; input: unknown; result?: ToolResult }) {
	return (
		<EventLine
			tone={result?.failed ? "err" : undefined}
			icon={<WrenchScrewdriverIcon />}
			head={
				<>
					<code>{name}</code>
					<span className="gist">{result?.failed ? "falhou" : gist(input)}</span>
				</>
			}
		>
			<div className="io">
				<Fields input={input} />
				{result?.text.trim() && <pre className={result.failed ? "bad" : undefined}>{truncate(result.text)}</pre>}
			</div>
		</EventLine>
	);
}

function Approval({ line, name }: { line: Extract<Line, { kind: "approval" }>; name: string }) {
	const { approval, outcome } = line;

	return (
		<div className="msg reply ask" role="group" aria-label="Aprovação">
			<div className="ask-head">
				{!outcome && <PauseCircleIcon />}
				<span>
					Aprovar <code>{approval.toolName}</code>
					{approval.bot !== name && (
						<>
							{" "}
							de <strong>{approval.bot}</strong>
						</>
					)}
					?
				</span>
			</div>
			<Fields input={approval.input} />
			{outcome ? (
				<p className="ask-foot" data-outcome={outcome}>
					{outcome === "approved" ? <CheckIcon /> : <XMarkIcon />}
					<span>Você {outcome === "approved" ? "aprovou" : "negou"}</span>
				</p>
			) : (
				<p className="ask-foot">
					<span>
						Responda <kbd>1</kbd> para aprovar ou <kbd>2</kbd> para negar.
					</span>
				</p>
			)}
		</div>
	);
}

type Happening = Extract<Line, { kind: "routine" | "team" | "note" | "tools" | "warning" | "error" | "stopped" }>;

function HappeningView({ line, level }: { line: Happening; level: Detail }) {
	switch (line.kind) {
		case "routine":
			return (
				<EventLine
					icon={<ClockIcon />}
					head={
						<span>
							Rotina <code>{line.name}</code> começou
						</span>
					}
				>
					{level === "full" && (
						<div className="io">
							<p className="said">{truncate(line.prompt)}</p>
						</div>
					)}
				</EventLine>
			);
		case "team":
			return (
				<EventLine
					icon={<UserGroupIcon />}
					head={
						<>
							<span>
								{TEAM_VERBS[line.call.kind]} <strong>{line.call.bot}</strong>
							</span>
							{line.call.task && <span className="gist">{line.call.task}</span>}
						</>
					}
				/>
			);
		case "note":
			return <EventLine icon={<UserGroupIcon />} head={<span>{line.text}</span>} />;
		case "tools":
			return <EventLine icon={<WrenchScrewdriverIcon />} head={<span>{line.tools.length > 0 ? `Grupos de tools: ${line.tools.join(", ")}` : "Nenhum grupo de tools"}</span>} />;
		case "warning":
			return <EventLine tone="warn" icon={<ExclamationTriangleIcon />} head={<span>{line.text}</span>} />;
		case "error":
			return <EventLine tone="err" icon={<XCircleIcon />} head={<span>{line.text}</span>} />;
		case "stopped":
			return <EventLine icon={<StopIcon />} head={<span>Interrompido</span>} />;
		default: {
			const _exhaustive: never = line;
			return _exhaustive;
		}
	}
}

const LineView = memo(function LineView({ line, level, name }: { line: Line; level: Detail; name: string }) {
	switch (line.kind) {
		case "you":
			return (
				<div className="msg you">
					<p>{line.text}</p>
				</div>
			);
		case "reply":
			return <Reply text={line.text} />;
		case "summary":
			return (
				<details className="summary">
					<summary>Resumo do que veio antes</summary>
					<p>{line.text}</p>
				</details>
			);
		case "tool":
			return <Tool name={line.name} input={line.input} result={line.result} />;
		case "approval":
			return <Approval line={line} name={name} />;
		default:
			return <HappeningView line={line} level={level} />;
	}
});

const Lines = memo(function Lines({ lines, level, name }: { lines: Line[]; level: Detail; name: string }) {
	return lines.map((line, index) => shows(level, needOf(line)) && <LineView key={index} line={line} level={level} name={name} />);
});

export function Transcript({ conversation, level, name }: { conversation: Conversation; level: Detail; name: string }) {
	if (!conversation.ready) {
		return <div className="scroll" />;
	}

	if (conversation.lines.length === 0 && conversation.turn === "idle" && conversation.queue.length === 0) {
		return (
			<div className="scroll">
				<div className="lines">
					<div className="empty">
						<Avatar name={name} state="idle" size={85} />
						<h3>Comece a conversa com {name}</h3>
						<p>Diga o que você precisa. {name} aprende com o uso e guarda na Memória o que importa.</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="scroll">
			<div className="lines">
				<Lines lines={conversation.lines} level={level} name={name} />
				{conversation.streaming && <Reply text={conversation.streaming} />}
				{conversation.queue.map((item, index) => (
					<EventLine key={index} icon={null} head={<span>Na fila: {item}</span>} />
				))}
			</div>
		</div>
	);
}
