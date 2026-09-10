import {
	BoxRenderable,
	InputRenderable,
	InputRenderableEvents,
	ScrollBoxRenderable,
	TextRenderable,
	type CliRenderer,
} from "@opentui/core";
import {
	resolveTextToResponses,
	type ActionResultStreamEvent,
	type ActionsRequestedStreamEvent,
	type InputOption,
	type InputRequest,
	type InputResolutionOutcome,
	type InputResolvedStreamEvent,
	type MessageResponse,
	type MessageStreamEvent,
} from "eve/client";
import { describeError, type AgentChat } from "./agent";

const TEXT_COLOR = "#D8DEE9";
const USER_COLOR = "#7DA6FF";
const TOOL_COLOR = "#8F98A8";
const ERROR_COLOR = "#FF6B6B";
const STATUS_COLOR = "#8F98A8";
const ATTENTION_COLOR = "#EBCB8B";
const BORDER_COLOR = "#3B4252";
const COMPOSER_BACKGROUND = "#1C1C1C";
const COMPOSER_FOCUSED_BACKGROUND = "#262626";

const RESOLUTION_TEXT: Record<InputResolutionOutcome, string> = {
	approved: "aprovado",
	denied: "recusado",
	answered: "respondido",
	ignored: "ignorado",
	invalid: "inválido",
};

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
	private pendingRequests: InputRequest[] = [];

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
		const responses = resolveTextToResponses(text, this.pendingRequests);
		if (responses.length > 0) {
			const answered = new Set(responses.map((response) => response.requestId));
			this.pendingRequests = this.pendingRequests.filter((request) => !answered.has(request.requestId));
			void this.run(() => this.chat.respond(responses));
			return;
		}
		this.sealReply();
		this.appendLine(`você: ${text}`, USER_COLOR);
		void this.run(() => this.chat.send(text));
	}

	private async run(operation: () => Promise<MessageResponse>): Promise<void> {
		this.busy = true;
		this.failed = false;
		this.setStatus("pensando");
		try {
			const response = await operation();
			for await (const event of response) {
				this.renderEvent(event);
			}
			if (this.failed) {
				this.setStatus("erro");
			} else {
				this.setStatus(this.pendingRequests.length > 0 ? "aguardando resposta" : "pronto");
			}
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
				this.renderActions(event.data.actions);
				return;
			case "action.result":
				this.renderActionResult(event.data);
				return;
			case "step.failed":
			case "turn.failed":
			case "session.failed":
				this.renderFailure(event.data.message);
				return;
			case "turn.cancelled":
				this.setStatus("cancelado");
				return;
			case "input.requested":
				this.renderInputRequests(event.data.requests);
				return;
			case "input.resolved":
				this.renderInputResolutions(event.data.resolutions);
				return;
			case "session.waiting":
				this.renderWaiting();
				return;
			default:
				return;
		}
	}

	private renderActions(actions: ActionsRequestedStreamEvent["data"]["actions"]): void {
		for (const action of actions) {
			const label = action.kind === "tool-call" ? action.toolName : action.kind;
			this.appendLine(`⚙ ${label}`, TOOL_COLOR);
		}
	}

	private renderActionResult(data: ActionResultStreamEvent["data"]): void {
		if (data.status === "failed" && data.error) {
			this.appendLine(`ferramenta falhou: ${data.error.message}`, ERROR_COLOR);
		}
	}

	private renderFailure(message: string): void {
		this.failed = true;
		this.appendLine(`erro: ${message}`, ERROR_COLOR);
		this.setStatus("erro");
	}

	private renderInputRequests(requests: readonly InputRequest[]): void {
		for (const request of requests) {
			this.pendingRequests.push(request);
			this.renderRequest(request);
		}
		this.setStatus("aguardando resposta");
	}

	private renderInputResolutions(resolutions: InputResolvedStreamEvent["data"]["resolutions"]): void {
		for (const resolution of resolutions) {
			this.pendingRequests = this.pendingRequests.filter(
				(request) => request.requestId !== resolution.requestId,
			);
			this.appendLine(`⏸ ${RESOLUTION_TEXT[resolution.outcome]}`, TOOL_COLOR);
		}
	}

	private renderWaiting(): void {
		if (this.failed) {
			this.setStatus("erro");
		} else if (this.pendingRequests.length > 0) {
			this.setStatus("aguardando resposta");
		} else {
			this.setStatus("pronto");
		}
	}

	private renderRequest(request: InputRequest): void {
		if (request.kind === "tool-approval") {
			this.appendLine(`⏸ aprovação: ${request.action.toolName}`, ATTENTION_COLOR);
			const input = JSON.stringify(request.action.input);
			if (input !== "{}") {
				this.appendLine(`   ${truncate(input, 240)}`, TOOL_COLOR);
			}
			this.appendLine(`   ${optionLine(request.options ?? [])}`, TEXT_COLOR);
			return;
		}
		this.appendLine(`⏸ ${request.prompt}`, ATTENTION_COLOR);
		const options = request.options ?? [];
		if (options.length > 0) {
			this.appendLine(`   ${optionLine(options)}`, TEXT_COLOR);
			return;
		}
		if (request.allowFreeform !== false) {
			this.appendLine("   responda com o texto", TOOL_COLOR);
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

function optionLine(options: readonly InputOption[]): string {
	return options.map((option, index) => `${index + 1}. ${optionLabel(option)}`).join("   ");
}

function optionLabel(option: InputOption): string {
	switch (option.id) {
		case "approve":
			return "Aprovar";
		case "cancel":
			return "Cancelar";
		default:
			return option.label;
	}
}

function truncate(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max)}…`;
}
