import { useMutation } from "@tanstack/react-query";
import { CheckIcon, CircleXIcon, ClockIcon, GlobeIcon, type LucideIcon, MailIcon, MessageSquareIcon, SendIcon, SquareIcon, TriangleAlertIcon, WrenchIcon, XIcon } from "lucide-react";
import { type ComponentProps, Fragment, memo, type ReactNode, type RefObject, startTransition, useEffect, useRef, useState } from "react";
import { Button } from "@renderer/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@renderer/components/ui/empty";
import { Input } from "@renderer/components/ui/input";
import { Spinner } from "@renderer/components/ui/spinner";
import { cn } from "cn";
import { Avatar } from "./avatar";
import { useBrowsing } from "./browsing";
import type { Conversation, Line, ToolResult } from "./conversation";
import { useLogins, type Login } from "./logins";
import { Prose, StreamingProse } from "./prose";
import { orpc } from "./rpc";

export const DETAIL_LEVELS = ["brief", "full"] as const;

export type Detail = (typeof DETAIL_LEVELS)[number];

export const DETAIL_NAMES: Record<Detail, string> = { brief: "Breve", full: "Completo" };

const TOOL_LABELS: Record<string, string> = {
	bash: "Rodou um comando",
	read: "Leu um arquivo",
	write: "Escreveu um arquivo",
	edit: "Mexeu num arquivo",
	current_time: "Viu as horas",
	save_memory: "Guardou na memória",
	remove_memory: "Tirou da memória",
	search_history: "Procurou no que já foi dito",
	read_history: "Releu o que já foi dito",
	web_search: "Procurou na web",
	browse: "Usou o navegador",
	list_bots: "Viu os outros bots",
	connect_gmail: "Conectou o Gmail",
	disconnect_gmail: "Desconectou o Gmail",
	list_accounts: "Viu as contas do Gmail",
	list_unread: "Viu os e-mails novos",
	read_thread: "Leu um e-mail",
	send_email: "Enviou um e-mail",
	create_draft: "Guardou um rascunho",
	list_routines: "Viu as rotinas",
	create_routine: "Criou uma rotina",
	update_routine: "Mudou uma rotina",
	delete_routine: "Apagou uma rotina",
};
const EMAIL_LABELS: Record<string, string> = { account: "De", to: "Para", cc: "Cópia", subject: "Assunto", threadId: "Thread" };
const CONNECT_GMAIL = "connect_gmail";
const PICTURES = "mimo-image";
const BROWSE = "browse";
const GMAIL_SCOPE = "ler, rascunhar e enviar e-mail em seu nome";
const DETAIL_CHARACTERS = 600;
const GIST_CHARACTERS = 160;
const PAGE_LINES = 40;
const PAGE_CHARACTERS = 6000;
const EARLIER_MARGIN = "1200px 0px 0px";
const SCROLL = "flex min-h-0 flex-1 flex-col-reverse overflow-y-auto scrollbar-gutter-both";
const DOCK =
	"sticky bottom-0 order-first shrink-0 bg-background before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-10 before:bg-linear-to-t before:from-background";
const LABEL = "shrink-0";
const GIST = "truncate before:mr-1.5 before:content-['·']";
const QUOTE = "mt-3 rounded-r-md border-l-2 border-foreground/25 bg-black/15 px-3 py-2";
const BUBBLES = {
	you: "ml-auto rounded-br-none bg-primary whitespace-pre-wrap text-primary-foreground",
	bot: "rounded-bl-none bg-muted",
};
const TONES = {
	warn: { line: undefined, icon: "text-warning" },
	err: { line: "text-destructive", icon: undefined },
};

function handoffReason(line: Line): string | null {
	if (line.kind !== "tool" || line.name !== BROWSE || !line.input || typeof line.input !== "object") {
		return null;
	}
	if (!("action" in line.input) || line.input.action !== "handoff") {
		return null;
	}
	if (!("reason" in line.input) || typeof line.input.reason !== "string") {
		return null;
	}
	return line.input.reason || null;
}

function verbose(line: Line): boolean {
	if (line.kind !== "tool" || line.name === CONNECT_GMAIL) {
		return false;
	}
	return handoffReason(line) === null;
}

function oneLine(text: string): string {
	return text.replaceAll(/\s+/gu, " ").trim().slice(0, GIST_CHARACTERS);
}

function truncate(text: string): string {
	if (text.length <= DETAIL_CHARACTERS) {
		return text;
	}
	return `${text.slice(0, DETAIL_CHARACTERS)}…`;
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
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

function Pasted({ botId, names, text }: { botId: string; names: readonly string[]; text: string }) {
	if (names.length === 0) {
		return <Bubble from="you">{text}</Bubble>;
	}
	return (
		<div className="mt-5 flex flex-col items-end gap-1.5">
			{names.map((name) => (
				<img
					key={name}
					src={`${PICTURES}://${botId}/${name}`}
					alt="Imagem que você colou"
					className="max-h-72 max-w-[min(85%,65ch)] rounded-2xl border border-border object-contain"
				/>
			))}
			{text && <Bubble from="you" className="mt-0">{text}</Bubble>}
		</div>
	);
}

interface EventLineProps {
	tone?: keyof typeof TONES;
	icon?: LucideIcon;
	head: ReactNode;
	onOpen?: () => void;
	children?: ReactNode;
}

function EventLine({ tone, icon: Icon, head, onOpen, children }: EventLineProps) {
	const colors = tone && TONES[tone];
	const inside = (
		<div className="inline-flex max-w-full items-start gap-1.5 *:min-w-0">
			{Icon && <Icon className={cn("h-lh w-3.5 shrink-0", colors?.icon)} />}
			{head}
		</div>
	);

	return (
		<div
			data-event
			className={cn(
				"mx-auto mt-4 max-w-4/5 text-center text-xs text-muted-foreground [[data-event]+&]:mt-1 [&_code]:text-foreground [&_strong]:font-medium [&_strong]:text-foreground",
				colors?.line,
			)}
		>
			{onOpen ? (
				<button type="button" className="max-w-full cursor-pointer rounded hover:text-foreground focus-visible:outline-2" onClick={onOpen}>
					{inside}
				</button>
			) : (
				inside
			)}
			{children}
		</div>
	);
}

function EventBody({ children }: { children: ReactNode }) {
	return <div className="mx-auto mt-2 max-w-xl text-left wrap-anywhere">{children}</div>;
}

function Tool({ name, input, result }: { name: string; input: unknown; result?: ToolResult }) {
	return (
		<EventLine
			tone={result?.failed ? "err" : undefined}
			icon={WrenchIcon}
			head={
				<>
					{TOOL_LABELS[name] ? <span className={LABEL}>{TOOL_LABELS[name]}</span> : <code className={LABEL}>{name}</code>}
					<span className={GIST}>{result?.failed ? "não deu certo" : gist(input)}</span>
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
			<div className={QUOTE}>
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
						{outcome === "approved" ? "Você aprovou" : "Você recusou"}
					</span>
				) : (
					<div className="flex gap-2">
						<Button variant="ghost" size="sm" disabled={answer.isPending} onClick={() => answer.mutate({ botId, id: approval.id, approved: false })}>
							Não
						</Button>
						<Button size="sm" disabled={answer.isPending} onClick={() => answer.mutate({ botId, id: approval.id, approved: true })}>
							Enviar
						</Button>
					</div>
				)}
			</div>
		</Bubble>
	);
}

function connectVerdict(result: ToolResult): { account: string | null } | null {
	if (result.failed) {
		return { account: null };
	}
	const parsed: unknown = parseJson(result.text);
	if (!parsed || typeof parsed !== "object" || !("account" in parsed)) {
		return null;
	}
	if (typeof parsed.account === "string") {
		return { account: parsed.account };
	}
	return { account: null };
}

function ConnectCard({ account, children }: { account: string | null; children: ReactNode }) {
	return (
		<Bubble from="bot" role="group" aria-label="Conectar o Gmail">
			<p>Preciso da sua conta do Google para isso.</p>
			<div className={cn(QUOTE, "flex items-center gap-2.5")}>
				<MailIcon className="size-4 shrink-0 text-muted-foreground" />
				<span className="min-w-0">
					<span className="block truncate text-sm">{account ?? "Gmail"}</span>
					<span className="block truncate text-xs text-muted-foreground">{GMAIL_SCOPE}</span>
				</span>
			</div>
			{children}
		</Bubble>
	);
}

function CardActions({ children }: { children: ReactNode }) {
	return <div className="mt-3 flex items-center justify-end gap-2 pl-3">{children}</div>;
}

function ConnectOutcome({ account }: { account: string | null }) {
	return (
		<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
			{account ? <CheckIcon className="size-3.5 text-success" /> : <XIcon className="size-3.5 text-destructive" />}
			{account ? "Conectado" : "Não conectou"}
		</span>
	);
}

function ConnectDone({ result }: { result: ToolResult }) {
	const verdict = connectVerdict(result);

	return (
		<ConnectCard account={verdict?.account ?? null}>
			{result.failed && <p className="mt-2 text-xs text-destructive">{truncate(result.text)}</p>}
			{verdict && (
				<CardActions>
					<ConnectOutcome account={verdict.account} />
				</CardActions>
			)}
		</ConnectCard>
	);
}

function ConnectAsking({ onConnect }: { onConnect: () => void }) {
	const cancel = useMutation(orpc.login.cancel.mutationOptions());

	return (
		<ConnectCard account={null}>
			<CardActions>
				<Button variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate({ target: "gmail" })}>
					Agora não
				</Button>
				<Button size="sm" onClick={onConnect}>
					Conectar
				</Button>
			</CardActions>
		</ConnectCard>
	);
}

function ConnectHint({ url }: { url: string | null }) {
	if (!url) {
		return <span>Autorize na janela do navegador</span>;
	}

	return (
		<span>
			<button
				type="button"
				className="cursor-pointer rounded underline-offset-2 hover:underline focus-visible:outline-2"
				onClick={() => window.open(url)}
			>
				Autorize
			</button>{" "}
			na janela do navegador
		</span>
	);
}

function ConnectWaiting({ login }: { login: Login | undefined }) {
	const cancel = useMutation(orpc.login.cancel.mutationOptions());
	const answer = useMutation(orpc.login.answer.mutationOptions());
	const [pasting, setPasting] = useState(false);
	const [code, setCode] = useState("");

	useEffect(() => {
		if (!login?.url) {
			return;
		}
		const once = `login-aberto:gmail:${login.run}`;
		if (sessionStorage.getItem(once)) {
			return;
		}
		sessionStorage.setItem(once, "1");
		window.open(login.url.link);
	}, [login?.url, login?.run]);

	return (
		<ConnectCard account={null}>
			{pasting && (
				<form
					className="mt-3 flex gap-1.5"
					onSubmit={(event) => {
						event.preventDefault();
						if (code.trim()) {
							answer.mutate({ target: "gmail", text: code });
						}
					}}
				>
					<Input
						autoFocus
						aria-label="Código de autorização"
						value={code}
						spellCheck={false}
						placeholder="Cole o código ou a URL"
						className="h-7 text-sm"
						onChange={(event) => setCode(event.target.value)}
					/>
					<Button size="sm" type="submit" disabled={!code.trim() || answer.isPending}>
						Enviar
					</Button>
				</form>
			)}
			<CardActions>
				<span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
					<Spinner className="size-3" />
					<ConnectHint url={login?.url?.link ?? null} />
				</span>
				{login?.url && !pasting && (
					<Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setPasting(true)}>
						colar o código na mão
					</Button>
				)}
				<Button variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate({ target: "gmail" })}>
					Cancelar
				</Button>
			</CardActions>
		</ConnectCard>
	);
}

function ConnectLive() {
	const logins = useLogins();
	const login = logins.gmail;
	const start = useMutation(orpc.login.start.mutationOptions());

	if ((!login || login.state === "asked") && !start.isPending && !start.isSuccess) {
		return <ConnectAsking onConnect={() => start.mutate({ target: "gmail" })} />;
	}

	if (login?.state === "done" || login?.state === "failed") {
		return (
			<ConnectCard account={login.account}>
				<CardActions>
					<ConnectOutcome account={login.account} />
				</CardActions>
			</ConnectCard>
		);
	}

	return <ConnectWaiting login={login} />;
}

function handoffVerdict(result: ToolResult): boolean | null {
	if (result.failed) {
		return false;
	}
	const parsed: unknown = parseJson(result.text);
	if (!parsed || typeof parsed !== "object" || !("helped" in parsed)) {
		return null;
	}
	return parsed.helped === true;
}

function HandoffCard({ reason, children }: { reason: string; children: ReactNode }) {
	return (
		<Bubble from="bot" role="group" aria-label="Abrir o navegador">
			<p>Preciso que você faça uma coisa no navegador.</p>
			<div className={cn(QUOTE, "flex items-start gap-2.5")}>
				<GlobeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<span className="min-w-0 text-sm">{reason}</span>
			</div>
			{children}
		</Bubble>
	);
}

function HandoffDone({ reason, result }: { reason: string; result: ToolResult }) {
	const helped = handoffVerdict(result);

	return (
		<HandoffCard reason={reason}>
			{result.failed && <p className="mt-2 text-xs text-destructive">{truncate(result.text)}</p>}
			{helped !== null && (
				<CardActions>
					<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
						{helped ? <CheckIcon className="size-3.5 text-success" /> : <XIcon className="size-3.5 text-destructive" />}
						{helped ? "Você fez" : "Você deixou pra lá"}
					</span>
				</CardActions>
			)}
		</HandoffCard>
	);
}

function Handoff({ botId, reason, result }: { botId: string; reason: string; result?: ToolResult }) {
	const browsing = useBrowsing(botId);
	const present = useMutation(orpc.browser.present.mutationOptions());
	const answer = useMutation(orpc.browser.answer.mutationOptions());

	if (result) {
		return <HandoffDone reason={reason} result={result} />;
	}

	return (
		<HandoffCard reason={reason}>
			<CardActions>
				<Button variant="ghost" size="sm" disabled={answer.isPending} onClick={() => answer.mutate({ botId, helped: false })}>
					Agora não
				</Button>
				<Button size="sm" disabled={present.isPending || browsing?.showing} onClick={() => present.mutate({ botId, open: true })}>
					Abrir o navegador
				</Button>
			</CardActions>
		</HandoffCard>
	);
}

function Connect({ result }: { result?: ToolResult }) {
	if (result) {
		return <ConnectDone result={result} />;
	}
	return <ConnectLive />;
}

type Happening = Extract<Line, { kind: "routine" | "asked" | "answered" | "warning" | "error" | "stopped" }>;

function HappeningView({ line, level, onPeer }: { line: Happening; level: Detail; onPeer: (peer: string) => void }) {
	switch (line.kind) {
		case "routine":
			return (
				<EventLine
					icon={ClockIcon}
					head={
						<span>
							Rotina <strong>{line.name}</strong>
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
		case "asked":
			return (
				<EventLine
					icon={SendIcon}
					onOpen={() => onPeer(line.peer)}
					head={
						<>
							<span className={LABEL}>
								Perguntou para <strong>{line.peer}</strong>
							</span>
							<span className={GIST}>{oneLine(line.prompt)}</span>
						</>
					}
				/>
			);
		case "answered":
			return (
				<EventLine
					tone={line.failed ? "err" : undefined}
					icon={line.failed ? CircleXIcon : MessageSquareIcon}
					onOpen={() => onPeer(line.peer)}
					head={
						<>
							<span className={LABEL}>
								<strong>{line.peer}</strong> {line.failed ? "não conseguiu" : "respondeu"}
							</span>
							<span className={GIST}>{oneLine(line.text)}</span>
						</>
					}
				/>
			);
		case "warning":
			return <EventLine tone="warn" icon={TriangleAlertIcon} head={<span>{line.text}</span>} />;
		case "error":
			return <EventLine tone="err" icon={CircleXIcon} head={<span>{line.text}</span>} />;
		case "stopped":
			return <EventLine icon={SquareIcon} head={<span>Você parou</span>} />;
		default: {
			const _exhaustive: never = line;
			return _exhaustive;
		}
	}
}

interface LineViewProps {
	line: Line;
	level: Detail;
	name: string;
	botId: string;
	onPeer: (peer: string) => void;
}

const LineView = memo(function LineView({ line, level, name, botId, onPeer }: LineViewProps) {
	switch (line.kind) {
		case "you":
			return <Pasted botId={botId} names={line.images} text={line.text} />;
		case "reply":
			return (
				<Bubble from="bot" className="markdown">
					<Prose text={line.text} />
				</Bubble>
			);
		case "summary":
			return (
				<details className="mt-2 text-xs">
					<summary className="flex cursor-pointer list-none items-center gap-3 text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border hover:text-foreground">
						Resumo do que veio antes
					</summary>
					<p className="mt-2 whitespace-pre-wrap text-muted-foreground">{line.text}</p>
				</details>
			);
		case "tool": {
			if (line.name === CONNECT_GMAIL) {
				return <Connect result={line.result} />;
			}
			const reason = handoffReason(line);
			if (reason) {
				return <Handoff botId={botId} reason={reason} result={line.result} />;
			}
			return <Tool name={line.name} input={line.input} result={line.result} />;
		}
		case "approval":
			return <Approval line={line} name={name} botId={botId} />;
		default:
			return <HappeningView line={line} level={level} onPeer={onPeer} />;
	}
});

function pageStart(lines: Line[], end: number): number {
	let start = end;
	let characters = 0;
	while (start > 0 && end - start < PAGE_LINES && characters < PAGE_CHARACTERS) {
		start -= 1;
		const line = lines[start];
		characters += "text" in line ? line.text.length : 0;
	}
	return start;
}

interface LinesProps {
	lines: Line[];
	level: Detail;
	name: string;
	botId: string;
	onPeer: (peer: string) => void;
	scroller: RefObject<HTMLDivElement | null>;
}

const Lines = memo(function Lines({ lines, level, name, botId, onPeer, scroller }: LinesProps) {
	const [from, setFrom] = useState<number | null>(null);
	const earlier = useRef<HTMLDivElement>(null);
	const start = from ?? pageStart(lines, lines.length);

	useEffect(() => {
		const mark = earlier.current;
		if (!mark) {
			return;
		}
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) {
					startTransition(() => setFrom(pageStart(lines, start)));
				}
			},
			{ root: scroller.current, rootMargin: EARLIER_MARGIN },
		);
		observer.observe(mark);
		return () => observer.disconnect();
	}, [scroller, lines, start]);

	return (
		<>
			{start > 0 && <div ref={earlier} />}
			{lines.slice(start).map((line, index) => (level === "full" || !verbose(line)) && <LineView key={start + index} line={line} level={level} name={name} botId={botId} onPeer={onPeer} />)}
		</>
	);
});

interface TranscriptProps {
	conversation: Conversation;
	level: Detail;
	name: string;
	botId: string;
	onPeer: (peer: string) => void;
	children: ReactNode;
}

export function Transcript({ conversation, level, name, botId, onPeer, children }: TranscriptProps) {
	const empty = conversation.lines.length === 0 && conversation.turn === "idle" && conversation.queue.length === 0;
	const scroller = useRef<HTMLDivElement>(null);

	return (
		<div ref={scroller} className={SCROLL}>
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
					<Lines lines={conversation.lines} level={level} name={name} botId={botId} onPeer={onPeer} scroller={scroller} />
					{conversation.streaming && (
						<Bubble from="bot" className="markdown">
							<StreamingProse text={conversation.streaming} />
						</Bubble>
					)}
					{conversation.queue.map((item, index) => (
						<EventLine
							key={index}
							head={
								<>
									<span className={LABEL}>Na fila</span>
									<span className={GIST}>{oneLine(item)}</span>
								</>
							}
						/>
					))}
				</div>
			)}
			<div className={DOCK}>{children}</div>
		</div>
	);
}
