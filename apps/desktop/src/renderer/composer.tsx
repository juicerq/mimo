import { useMutation } from "@tanstack/react-query";
import { ArrowUpIcon } from "lucide-react";
import { type FormEvent, type KeyboardEvent, memo, type RefObject, useEffect, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@renderer/components/ui/input-group";
import { orpc } from "./rpc";

const drafts = new Map<string, string>();

interface ComposerProps {
	botId: string;
	name: string;
	working: boolean;
	input: RefObject<HTMLTextAreaElement | null>;
	fail: (message: string) => void;
}

export const Composer = memo(function Composer({ botId, name, working, input, fail }: ComposerProps) {
	const [draft, setDraft] = useState(() => drafts.get(botId) ?? "");
	const send = useMutation(orpc.conversation.send.mutationOptions({
		onError: (error, { text }) => {
			setDraft((current) => current || text);
			fail(error.message);
		},
	}));

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

	function submit(event: FormEvent): void {
		event.preventDefault();
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
			event.currentTarget.form?.requestSubmit();
		}
	}

	return (
		<form className="column pt-2 pb-5 short:pb-2.5" onSubmit={submit}>
			<InputGroup className="items-end rounded-3xl bg-card shadow-md has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-card">
				<InputGroupTextarea
					ref={input}
					rows={1}
					value={draft}
					aria-label="Mensagem"
					placeholder={working ? `Mensagem para ${name}, entra na fila` : `Mensagem para ${name}`}
					className="max-h-44 min-h-0 py-3 pl-4 text-sm"
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={onKeyDown}
				/>
				<InputGroupAddon align="inline-end" className="pr-1.5 has-[>button]:mr-0">
					<InputGroupButton
						type="submit"
						variant="default"
						size="icon-sm"
						className="rounded-full aria-disabled:pointer-events-none aria-disabled:opacity-50"
						aria-label="Enviar"
						aria-disabled={!draft.trim()}
					>
						<ArrowUpIcon />
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
});
