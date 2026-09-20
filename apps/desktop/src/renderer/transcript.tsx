import { useMutation } from "@tanstack/react-query";
import { CheckIcon, CircleXIcon, ClockIcon, type LucideIcon, SquareIcon, TriangleAlertIcon, UsersIcon, WrenchIcon, XIcon } from "lucide-react";
import { type ComponentProps, Fragment, memo, type ReactNode, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@renderer/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@renderer/components/ui/empty";
import { cn } from "cn";
import { Avatar } from "./avatar";
import type { Conversation, Line, ToolResult } from "./conversation";
import { orpc } from "./rpc";

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
const EMAIL_LABELS: Record<string, string> = { account: "De", to: "Para", cc: "Cópia", subject: "Assunto", draftId: "Rascunho" };
const DETAIL_CHARACTERS = 600;
const PLUGINS = [remarkGfm];
const SCROLL = "flex min-h-0 flex-1 flex-col-reverse overflow-y-auto scrollbar-gutter-both";
const DOCK =
	"sticky bottom-0 order-first shrink-0 bg-background before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-10 before:bg-linear-to-t before:from-background";
const GIST = "truncate before:mr-1.5 before:content-['·']";
const BUBBLES = {
	you: "ml-auto rounded-br-none bg-primary whitespace-pre-wrap text-primary-foreground",
	bot: "rounded-bl-none bg-muted",
};
const TONES = {
	warn: { line: undefined, icon: "text-warning" },
	err: { line: "text-destructive", icon: undefined },
};
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

function fields(input: unknown, whole = false): [string, string][] {
	if (!input || typeof input !== "object") {
		return [];
	}
	return Object.entries(input).map(([key, value]) => [key, whole ? valueText(value) : truncate(valueText(value))]);
}

function long(input: unknown): boolean {
	return fields(input, true).some(([, value]) => value.length > DETAIL_CHARACTERS);
}

function gist(input: unknown): string {
	const first = fields(input)[0]?.[1] ?? "";
	return first.replace(/^https?:\/\//u, "").replaceAll(/\s+/gu, " ");
}

function Fields({ input, className, whole, labels }: { input: unknown; className?: string; whole?: boolean; labels?: Record<string, string> }) {
	const rows = fields(input, whole);
	if (rows.length === 0) {
		return null;
	}
	return (
		<dl className={cn("grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-xs leading-relaxed", className)}>
			{rows.map(([key, value]) => (
				<Fragment key={key}>
					<dt className="text-muted-foreground">{labels?.[key] ?? key}</dt>
					<dd className="whitespace-pre-wrap text-foreground">{value}</dd>
				</Fragment>
			))}
		</dl>
	);
}

function Bubble({ from, className, ...props }: ComponentProps<"div"> & { from: keyof typeof BUBBLES }) {
	return <div className={cn("mt-5 w-fit max-w-[min(85%,65ch)] rounded-2xl px-4 py-2.5 wrap-anywhere", BUBBLES[from], className)} {...props} />;
}

interface EventLineProps {
	tone?: keyof typeof TONES;
	icon?: LucideIcon;
	head: ReactNode;
	children?: ReactNode;
}

function EventLine({ tone, icon: Icon, head, children }: EventLineProps) {
	const colors = tone && TONES[tone];

	return (
		<div
			data-event
			className={cn(
				"mx-auto mt-4 max-w-4/5 text-center text-xs text-muted-foreground [[data-event]+&]:mt-1 [&_code]:text-foreground [&_strong]:font-medium [&_strong]:text-foreground",
				colors?.line,
			)}
		>
			<div className="inline-flex max-w-full items-start gap-1.5 *:min-w-0">
				{Icon && <Icon className={cn("h-lh w-3.5 shrink-0", colors?.icon)} />}
				{head}
			</div>
			{children}
		</div>
	);
}

function EventBody({ children }: { children: ReactNode }) {
	return <div className="mx-auto mt-2 max-w-xl text-left wrap-anywhere">{children}</div>;
}

function Reply({ text }: { text: string }) {
	return (
		<Bubble from="bot" className="markdown">
			<Markdown remarkPlugins={PLUGINS} components={COMPONENTS}>
				{text}
			</Markdown>
		</Bubble>
	);
}

function Tool({ name, input, result }: { name: string; input: unknown; result?: ToolResult }) {
	return (
		<EventLine
			tone={result?.failed ? "err" : undefined}
			icon={WrenchIcon}
			head={
				<>
					<code>{name}</code>
					<span className={GIST}>{result?.failed ? "falhou" : gist(input)}</span>
				</>
			}
		>
			<EventBody>
				<Fields input={input} />
				{result?.text.trim() && (
					<pre
						className={cn(
							"mt-2 max-h-60 overflow-auto rounded-xl border bg-subtle px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-foreground",
							result.failed && "text-destructive",
						)}
					>
						{truncate(result.text)}
					</pre>
				)}
			</EventBody>
		</EventLine>
	);
}

function Approval({ line, name, botId }: { line: Extract<Line, { kind: "approval" }>; name: string; botId: string }) {
	const { approval, outcome } = line;
	const [whole, setWhole] = useState(false);
	const answer = useMutation(orpc.conversation.answer.mutationOptions());
	const rows = fields(approval.input, whole);
	const head = Object.fromEntries(rows.filter(([key]) => key in EMAIL_LABELS));
	const body = rows.filter(([key]) => !(key in EMAIL_LABELS));

	return (
		<Bubble from="bot" role="group" aria-label="Confirmar envio">
			<p>
				{approval.bot === name ? (
					"Posso enviar este e-mail?"
				) : (
					<>
						<strong>{approval.bot}</strong> quer enviar este e-mail. Posso?
					</>
				)}
			</p>
			<div className="mt-3 border-l-2 border-foreground/20 pl-3">
				<Fields input={head} whole={whole} labels={EMAIL_LABELS} className="font-sans" />
				{body.map(([key, value]) => (
					<p key={key} className="mt-2 whitespace-pre-wrap first:mt-0">
						{value}
					</p>
				))}
				{!whole && long(approval.input) && (
					<Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setWhole(true)}>
						ver tudo
					</Button>
				)}
			</div>
			<div className="mt-3 flex justify-end pl-3">
				{outcome ? (
					<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
						{outcome === "approved" ? <CheckIcon className="size-3.5 text-success" /> : <XIcon className="size-3.5 text-destructive" />}
						{outcome === "approved" ? "Enviado" : "Cancelado"}
					</span>
				) : (
					<div className="flex gap-2">
						<Button variant="ghost" size="sm" disabled={answer.isPending} onClick={() => answer.mutate({ botId, approved: false })}>
							Não
						</Button>
						<Button size="sm" disabled={answer.isPending} onClick={() => answer.mutate({ botId, approved: true })}>
							Enviar
						</Button>
					</div>
				)}
			</div>
		</Bubble>
	);
}

type Happening = Extract<Line, { kind: "routine" | "team" | "note" | "tools" | "warning" | "error" | "stopped" }>;

function HappeningView({ line, level }: { line: Happening; level: Detail }) {
	switch (line.kind) {
		case "routine":
			return (
				<EventLine
					icon={ClockIcon}
					head={
						<span>
							Rotina <code>{line.name}</code> começou
						</span>
					}
				>
					{level === "full" && (
						<EventBody>
							<p className="whitespace-pre-wrap text-foreground">{truncate(line.prompt)}</p>
						</EventBody>
					)}
				</EventLine>
			);
		case "team":
			return (
				<EventLine
					icon={UsersIcon}
					head={
						<>
							<span>
								{TEAM_VERBS[line.call.kind]} <strong>{line.call.bot}</strong>
							</span>
							{line.call.task && <span className={GIST}>{line.call.task}</span>}
						</>
					}
				/>
			);
		case "note":
			return <EventLine icon={UsersIcon} head={<span>{line.text}</span>} />;
		case "tools":
			return <EventLine icon={WrenchIcon} head={<span>{line.tools.length > 0 ? `Grupos de tools: ${line.tools.join(", ")}` : "Nenhum grupo de tools"}</span>} />;
		case "warning":
			return <EventLine tone="warn" icon={TriangleAlertIcon} head={<span>{line.text}</span>} />;
		case "error":
			return <EventLine tone="err" icon={CircleXIcon} head={<span>{line.text}</span>} />;
		case "stopped":
			return <EventLine icon={SquareIcon} head={<span>Interrompido</span>} />;
		default: {
			const _exhaustive: never = line;
			return _exhaustive;
		}
	}
}

const LineView = memo(function LineView({ line, level, name, botId }: { line: Line; level: Detail; name: string; botId: string }) {
	switch (line.kind) {
		case "you":
			return <Bubble from="you">{line.text}</Bubble>;
		case "reply":
			return <Reply text={line.text} />;
		case "summary":
			return (
				<details className="mt-2 text-xs">
					<summary className="flex cursor-pointer list-none items-center gap-3 text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border hover:text-foreground">
						Resumo do que veio antes
					</summary>
					<p className="mt-2 whitespace-pre-wrap text-muted-foreground">{line.text}</p>
				</details>
			);
		case "tool":
			return <Tool name={line.name} input={line.input} result={line.result} />;
		case "approval":
			return <Approval line={line} name={name} botId={botId} />;
		default:
			return <HappeningView line={line} level={level} />;
	}
});

const Lines = memo(function Lines({ lines, level, name, botId }: { lines: Line[]; level: Detail; name: string; botId: string }) {
	return lines.map((line, index) => shows(level, needOf(line)) && <LineView key={index} line={line} level={level} name={name} botId={botId} />);
});

interface TranscriptProps {
	conversation: Conversation;
	level: Detail;
	name: string;
	botId: string;
	children: ReactNode;
}

export function Transcript({ conversation, level, name, botId, children }: TranscriptProps) {
	const empty = conversation.lines.length === 0 && conversation.turn === "idle" && conversation.queue.length === 0;

	return (
		<div className={SCROLL}>
			{conversation.ready && empty && (
				<Empty className="grow">
					<EmptyHeader>
						<EmptyMedia>
							<Avatar name={name} state="idle" size={80} />
						</EmptyMedia>
						<EmptyTitle role="heading" aria-level={3} className="text-lg font-semibold">
							Comece a conversa com {name}
						</EmptyTitle>
						<EmptyDescription>Diga o que você precisa. {name} aprende com o uso e guarda na Memória o que importa.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
			{conversation.ready && !empty && (
				<div className="shrink-0 grow px-6 pt-2 pb-11">
					<Lines lines={conversation.lines} level={level} name={name} botId={botId} />
					{conversation.streaming && <Reply text={conversation.streaming} />}
					{conversation.queue.map((item, index) => (
						<EventLine key={index} head={<span>Na fila: {item}</span>} />
					))}
				</div>
			)}
			<div className={DOCK}>{children}</div>
		</div>
	);
}
