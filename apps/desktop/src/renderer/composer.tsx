import { useMutation } from "@tanstack/react-query";
import { type KeyboardEvent, type RefObject, useEffect, useState } from "react";
import { orpc } from "./rpc";

const drafts = new Map<string, string>();

interface ComposerProps {
	botId: string;
	name: string;
	working: boolean;
	input: RefObject<HTMLTextAreaElement | null>;
	fail: (message: string) => void;
}

export function Composer({ botId, name, working, input, fail }: ComposerProps) {
	const [draft, setDraft] = useState(() => drafts.get(botId) ?? "");
	const send = useMutation(orpc.conversation.send.mutationOptions({
		onError: (error, { text }) => {
			setDraft((current) => current || text);
			fail(error.message);
		},
	}));
	const cancel = useMutation(orpc.conversation.cancel.mutationOptions());

	useEffect(() => {
		drafts.set(botId, draft);
	}, [botId, draft]);

	useEffect(() => {
		const field = input.current;
		if (field && document.activeElement === document.body) {
			field.focus();
			field.setSelectionRange(field.value.length, field.value.length);
		}
	}, [input]);

	function submit(): void {
		const text = draft.trim();
		if (!text) {
			return;
		}
		setDraft("");
		send.mutate({ botId, text });
	}

	function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
		if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault();
			submit();
		}
	}

	return (
		<div className="composer">
			<textarea
				ref={input}
				rows={1}
				value={draft}
				placeholder={`Fale com ${name}`}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={onKeyDown}
			/>
			{working && (
				<button type="button" onClick={() => cancel.mutate({ botId })}>
					parar
				</button>
			)}
		</div>
	);
}
