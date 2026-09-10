import {
	BoxRenderable,
	InputRenderable,
	InputRenderableEvents,
	ScrollBoxRenderable,
	TextRenderable,
	type CliRenderer,
} from "@opentui/core";
import type { MessageStreamEvent } from "eve/client";
import { describeError, type AgentChat } from "./agent";

const TEXT_COLOR = "#D8DEE9";
const USER_COLOR = "#7DA6FF";
const TOOL_COLOR = "#8F98A8";
const ERROR_COLOR = "#FF6B6B";
const STATUS_COLOR = "#8F98A8";
const BORDER_COLOR = "#3B4252";
const COMPOSER_BACKGROUND = "#1C1C1C";
const COMPOSER_FOCUSED_BACKGROUND = "#262626";

export class MimoApp {
	private readonly chat: AgentChat;
	private readonly renderer: CliRenderer;
	private readonly transcript: ScrollBoxRenderable;
	private readonly status: TextRenderable;
	private readonly input: InputRenderable;
	private reply: TextRenderable | null = null;
	private replyText = "";
	private busy = false;
	private failed = false;

	constructor(renderer: CliRenderer, chat: AgentChat) {
		this.renderer = renderer;
		this.chat = chat;

		this.transcript = new ScrollBoxRenderable(renderer, {
			id: "transcript",
			width: "100%",
			flexGrow: 1,
			border: true,
			borderStyle: "rounded",
			borderColor: BORDER_COLOR,
			title: "mimo",
			padding: 1,
			stickyScroll: true,
			stickyStart: "bottom",
		});
		this.status = new TextRenderable(renderer, {
			id: "status",
			content: "",
			fg: STATUS_COLOR,
		});
		this.input = new InputRenderable(renderer, {
			id: "composer",
			width: "100%",
			placeholder: "mensagem para o bot…",
			backgroundColor: COMPOSER_BACKGROUND,
			focusedBackgroundColor: COMPOSER_FOCUSED_BACKGROUND,
			textColor: "#FFFFFF",
			cursorColor: USER_COLOR,
		});
		this.input.on(InputRenderableEvents.ENTER, (value) => {
			this.submit(value);
		});

		const container = new BoxRenderable(renderer, {
			id: "app",
			width: "100%",
			height: "100%",
			flexDirection: "column",
		});
		container.add(this.transcript);
		container.add(this.status);
		container.add(this.input);
		renderer.root.add(container);
	}

	async start(): Promise<void> {
		this.input.focus();
		this.setStatus("conectando");
		const problem = await this.chat.connectionProblem();
		if (problem === null) {
			this.setStatus("pronto");
			return;
		}
		this.appendLine(`agente indisponível: ${problem}`, ERROR_COLOR);
		this.setStatus("offline");
	}

	private submit(value: string): void {
		const text = value.trim();
		if (this.busy || text.length === 0) {
			return;
		}
		this.input.value = "";
		void this.runTurn(text);
	}

	private async runTurn(text: string): Promise<void> {
		this.busy = true;
		this.failed = false;
		this.sealReply();
		this.setStatus("pensando");
		this.appendLine(`você: ${text}`, USER_COLOR);
		try {
			const response = await this.chat.send(text);
			for await (const event of response) {
				this.renderEvent(event);
			}
			this.setStatus(this.failed ? "erro" : "pronto");
		} catch (error) {
			this.failed = true;
			this.appendLine(`erro: ${describeError(error)}`, ERROR_COLOR);
			this.setStatus("erro");
		} finally {
			this.busy = false;
			this.sealReply();
		}
	}

	private renderEvent(event: MessageStreamEvent): void {
		switch (event.type) {
			case "message.appended":
				this.appendReplyDelta(event.data.messageDelta);
				return;
			case "message.completed":
				this.completeReply(event.data.message);
				return;
			case "actions.requested":
				for (const action of event.data.actions) {
					const label = action.kind === "tool-call" ? action.toolName : action.kind;
					this.appendLine(`⚙ ${label}`, TOOL_COLOR);
				}
				return;
			case "action.result":
				if (event.data.status === "failed" && event.data.error) {
					this.appendLine(`ferramenta falhou: ${event.data.error.message}`, ERROR_COLOR);
				}
				return;
			case "step.failed":
			case "turn.failed":
			case "session.failed":
				this.failed = true;
				this.appendLine(`erro: ${event.data.message}`, ERROR_COLOR);
				this.setStatus("erro");
				return;
			case "turn.cancelled":
				this.setStatus("cancelado");
				return;
			case "session.waiting":
				this.setStatus(this.failed ? "erro" : "pronto");
				return;
			default:
				return;
		}
	}

	private appendReplyDelta(delta: string): void {
		const block = this.ensureReply();
		this.replyText += delta;
		block.content = this.replyText;
	}

	private completeReply(message: string | null): void {
		if (message !== null) {
			const block = this.ensureReply();
			this.replyText = message;
			block.content = message;
		}
		this.sealReply();
	}

	private ensureReply(): TextRenderable {
		if (this.reply) {
			return this.reply;
		}
		this.replyText = "";
		this.reply = this.appendLine("");
		return this.reply;
	}

	private sealReply(): void {
		this.reply = null;
		this.replyText = "";
	}

	private appendLine(content: string, fg = TEXT_COLOR): TextRenderable {
		const line = new TextRenderable(this.renderer, {
			content,
			fg,
			width: "100%",
			wrapMode: "word",
			marginBottom: 1,
		});
		this.transcript.add(line);
		return line;
	}

	private setStatus(state: string): void {
		this.status.content = `mimo · ${this.chat.url} · ${state}`;
	}
}
