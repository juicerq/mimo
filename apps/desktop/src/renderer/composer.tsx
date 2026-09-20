import { useMutation } from "@tanstack/react-query";
import { ArrowUpIcon, XIcon } from "lucide-react";
import { type ClipboardEvent, type FormEvent, type KeyboardEvent, memo, type RefObject, useEffect, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@renderer/components/ui/input-group";
import { orpc } from "./rpc";

interface Picture {
	id: string;
	mimeType: string;
	data: string;
}

const drafts = new Map<string, string>();
const pastes = new Map<string, Picture[]>();

function readPicture(file: File): Promise<Picture> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error(`Não deu para ler ${file.name || "a imagem"}.`));
		reader.onload = () => {
			const read = typeof reader.result === "string" ? reader.result : "";
			resolve({ id: crypto.randomUUID(), mimeType: file.type, data: read.split(",")[1] ?? "" });
		};
		reader.readAsDataURL(file);
	});
}

interface ComposerProps {
	botId: string;
	name: string;
	working: boolean;
	input: RefObject<HTMLTextAreaElement | null>;
	fail: (message: string) => void;
}

export const Composer = memo(function Composer({ botId, name, working, input, fail }: ComposerProps) {
	const [draft, setDraft] = useState(() => drafts.get(botId) ?? "");
	const [pictures, setPictures] = useState<Picture[]>(() => pastes.get(botId) ?? []);
	const send = useMutation(orpc.conversation.send.mutationOptions({
		onError: (error, variables) => {
			setDraft((current) => current || variables.text);
			setPictures((current) => current.length > 0 ? current : (variables.images ?? []).map((image) => ({ ...image, id: crypto.randomUUID() })));
			fail(error.message);
		},
	}));

	useEffect(() => {
		drafts.set(botId, draft);
	}, [botId, draft]);

	useEffect(() => {
		pastes.set(botId, pictures);
	}, [botId, pictures]);

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
		if (!text && pictures.length === 0) {
			return;
		}
		setDraft("");
		setPictures([]);
		send.mutate({ botId, text, images: pictures.map(({ mimeType, data }) => ({ mimeType, data })) });
	}

	function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
		if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault();
			event.currentTarget.form?.requestSubmit();
		}
	}

	function onPaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
		const files = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
		if (files.length === 0) {
			return;
		}
		event.preventDefault();
		Promise.all(files.map(readPicture))
			.then((pasted) => setPictures((current) => [...current, ...pasted]))
			.catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
	}

	return (
		<form className="column pt-2 pb-5 short:pb-2.5" onSubmit={submit}>
			{pictures.length > 0 && (
				<ul className="mb-2 flex flex-wrap gap-2">
					{pictures.map((picture) => (
						<li key={picture.id} className="relative">
							<img
								src={`data:${picture.mimeType};base64,${picture.data}`}
								alt="Imagem colada"
								className="size-16 rounded-xl border border-border object-cover"
							/>
							<button
								type="button"
								aria-label="Tirar a imagem"
								className="-right-1.5 -top-1.5 absolute grid size-5 place-items-center rounded-full bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80"
								onClick={() => setPictures((current) => current.filter((item) => item.id !== picture.id))}
							>
								<XIcon className="size-3" />
							</button>
						</li>
					))}
				</ul>
			)}
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
					onPaste={onPaste}
				/>
				<InputGroupAddon align="inline-end" className="pr-1.5 has-[>button]:mr-0">
					<InputGroupButton
						type="submit"
						variant="default"
						size="icon-sm"
						className="rounded-full aria-disabled:pointer-events-none aria-disabled:opacity-50"
						aria-label="Enviar"
						aria-disabled={!draft.trim() && pictures.length === 0}
					>
						<ArrowUpIcon />
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
});
