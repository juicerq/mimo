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
	type MessageStreamEvent,
} from "eve/client";
import { describeError, type AgentChat } from "./agent";

const T1 = "#F2F2F3";
const T2 = "#C9C9CC";
const T3 = "#9A9A9E";
const T4 = "#6B6B6F";
const TEXT_COLOR = T1;
const USER_COLOR = T3;
const TOOL_COLOR = T4;
const ERROR_COLOR = T1;
const STATUS_COLOR = T4;
const ATTENTION_COLOR = T1;
const FOLLOW_RESTART_MS = 2_000;

type BotMode = "normal" | "autonomous";

const RESOLUTION_TEXT: Record<InputResolutionOutcome, string> = {
	approved: "approved",
	denied: "denied",
	answered: "answered",
	ignored: "ignored",
	invalid: "invalid",
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
	private following = false;
	private mode: BotMode = "normal";
	private lastState = "";
	private pendingRequests: InputRequest[] = [];

	constructor(renderer: CliRenderer, chat: AgentChat) {
		this.renderer = renderer;
		this.chat = chat;

		this.transcript = new ScrollBoxRenderable(renderer, {
			id: "transcript",
			width: "100%",
			flexGrow: 1,
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
			placeholder: "message the bot…",
			textColor: T2,
			cursorColor: T1,
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
		container.add(this.input);
		container.add(this.status);
		renderer.root.add(container);
	}

	async start(): Promise<void> {
		this.input.focus();
		this.setStatus("connecting");
		const problem = await this.chat.connectionProblem();
		if (problem === null) {
			this.setStatus("ready");
			return;
		}
		this.appendLine(`✗ agent unavailable: ${problem}`, ERROR_COLOR);
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
			void this.dispatch(() => this.chat.respond(responses));
			return;
		}
		this.sealReply();
		this.appendLine(`you: ${text}`, USER_COLOR);
		void this.dispatch(() => this.chat.send(text));
	}

	private async dispatch(operation: () => Promise<void>): Promise<void> {
		this.failed = false;
		this.busy = true;
		this.setStatus("thinking");
		try {
			await operation();
		} catch (error) {
			this.busy = false;
			this.failed = true;
			this.appendLine(`✗ error: ${describeError(error)}`, ERROR_COLOR);
			this.setStatus("error");
			return;
		}
		await this.follow();
	}

	private async follow(): Promise<void> {
		if (this.following) {
			return;
		}
		this.following = true;
		let reported = false;
		try {
			while (this.following) {
				try {
					const stream = this.chat.stream();
					if (stream === null) {
						return;
					}
					for await (const event of stream) {
						reported = false;
						this.renderEvent(event);
					}
				} catch (error) {
					if (!reported) {
						reported = true;
						this.appendLine(`✗ stream dropped: ${describeError(error)}`, ERROR_COLOR);
					}
				}
				await Bun.sleep(FOLLOW_RESTART_MS);
			}
		} finally {
			this.following = false;
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
			case "turn.started":
				this.busy = true;
				this.setStatus("thinking");
				return;
			case "turn.completed":
			case "session.completed":
				this.busy = false;
				return;
			case "step.failed":
			case "turn.failed":
			case "session.failed":
				this.renderFailure(event.data.message);
				return;
			case "turn.cancelled":
				this.busy = false;
				this.setStatus("cancelled");
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
		const mode = modeFromToolResult(data.result);
		if (mode !== null) {
			this.mode = mode;
			this.setStatus(this.lastState);
		}
		if (data.status === "failed" && data.error) {
			this.appendLine(`✗ tool failed: ${data.error.message}`, ERROR_COLOR);
		}
	}

	private renderFailure(message: string): void {
		this.busy = false;
		this.failed = true;
		this.appendLine(`✗ error: ${message}`, ERROR_COLOR);
		this.setStatus("error");
	}

	private renderInputRequests(requests: readonly InputRequest[]): void {
		for (const request of requests) {
			this.pendingRequests.push(request);
			this.renderRequest(request);
		}
		this.busy = false;
		this.setStatus("waiting");
	}

	private renderInputResolutions(resolutions: InputResolvedStreamEvent["data"]["resolutions"]): void {
		for (const resolution of resolutions) {
			this.pendingRequests = this.pendingRequests.filter(
				(request) => request.requestId !== resolution.requestId,
			);
			this.appendLine(`⏸ ${RESOLUTION_TEXT[resolution.outcome]}`, TOOL_COLOR);
		}
		if (resolutions.length > 0) {
			this.busy = true;
			this.setStatus("thinking");
		}
	}

	private renderWaiting(): void {
		this.busy = false;
		if (this.failed) {
			this.setStatus("error");
		} else if (this.pendingRequests.length > 0) {
			this.setStatus("waiting");
		} else {
			this.setStatus("ready");
		}
	}

	private renderRequest(request: InputRequest): void {
		if (request.kind === "tool-approval") {
			this.appendLine(`▌ ⏸ approval: ${request.action.toolName}`, ATTENTION_COLOR);
			const input = JSON.stringify(request.action.input);
			if (input !== "{}") {
				this.appendLine(`   ${truncate(input, 240)}`, TOOL_COLOR);
			}
			this.appendLine(`   ${optionLine(request.options ?? [])}`, TEXT_COLOR);
			return;
		}
		this.appendLine(`▌ ⏸ ${request.prompt}`, ATTENTION_COLOR);
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
		this.lastState = state;
		const label = this.mode === "autonomous" ? "auto" : "normal";
		this.status.content = `mode: ${label} · status: ${state}`;
	}
}

function modeFromToolResult(result: ActionResultStreamEvent["data"]["result"]): BotMode | null {
	if (result.kind !== "tool-result" || result.toolName !== "set_mode" || result.isError === true) {
		return null;
	}
	const output = result.output;
	if (typeof output !== "object" || output === null || !("mode" in output)) {
		return null;
	}
	const mode = output["mode"];
	if (mode === "normal" || mode === "autonomous") {
		return mode;
	}
	return null;
}

function optionLine(options: readonly InputOption[]): string {
	return options.map((option, index) => `${index + 1}. ${optionLabel(option)}`).join("   ");
}

function optionLabel(option: InputOption): string {
	switch (option.id) {
		case "approve":
			return "Approve";
		case "cancel":
			return "Cancel";
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
