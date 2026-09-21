import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useCallback, useState } from "react";
import { IconButton } from "@renderer/components/icon-button";
import { Button } from "@renderer/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@renderer/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@renderer/components/ui/dialog";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@renderer/components/ui/item";
import { Avatar, STATE_LABELS } from "./avatar";
import type { BotRow } from "./bots";
import { watchSidebar } from "./face";
import { orpc } from "./rpc";
import { Settings } from "./settings";
import type { Detail } from "./transcript";

const AVATAR = 48;

function plain(text: string): string {
	return text
		.replaceAll(/^\s*(?:#{1,6}|>|[-*+]|\d+\.)\s+/gmu, "")
		.replaceAll(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
		.replaceAll(/\*\*|__|~~|`/gu, "");
}

function preview(bot: BotRow): string {
	if (!bot.last) {
		return "Sem mensagens ainda";
	}
	if (bot.last.from === "you") {
		return `Você: ${bot.last.text}`;
	}
	return plain(bot.last.text);
}

function Remove({ bot, onClose }: { bot: BotRow; onClose: () => void }) {
	const queryClient = useQueryClient();
	const remove = useMutation(orpc.bots.delete.mutationOptions({
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.bots.list.key() });
			onClose();
		},
	}));

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-100">
				<DialogHeader>
					<DialogTitle>Apagar {bot.name}?</DialogTitle>
					<DialogDescription>A conversa, a memória e as rotinas dele vão junto. Isso não volta.</DialogDescription>
				</DialogHeader>
				{remove.error && <p className="text-xs text-destructive wrap-anywhere">{remove.error.message}</p>}
				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						Deixa pra lá
					</Button>
					<Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate({ botId: bot.id })}>
						Apagar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface BarProps {
	bots: BotRow[] | undefined;
	error: Error | null;
	selected: string | undefined;
	onSelect: (id: string) => void;
	focusComposer: () => void;
	level: Detail;
	onLevel: (level: Detail) => void;
}

export function Bar({ bots, error, selected, onSelect, focusComposer, level, onLevel }: BarProps) {
	const queryClient = useQueryClient();
	const [adding, setAdding] = useState(false);
	const [name, setName] = useState("");
	const [removing, setRemoving] = useState<BotRow | null>(null);
	const create = useMutation(orpc.bots.create.mutationOptions({
		onSuccess: async (bot) => {
			await queryClient.invalidateQueries({ queryKey: orpc.bots.list.key() });
			setName("");
			setAdding(false);
			onSelect(bot.id);
		},
	}));
	const empty = bots?.length === 0;
	const draft = name.trim();

	function stopAdding(): void {
		setName("");
		setAdding(false);
		create.reset();
	}

	const zone = useCallback((element: HTMLElement | null) => (element ? watchSidebar(element) : undefined), []);

	return (
		<aside ref={zone} className="flex w-66 shrink-0 flex-col border-r surface-sidebar" aria-label="Bots">
			<header className="drag flex h-bar shrink-0 items-center justify-end px-3">
				<IconButton label="Novo bot" onClick={() => setAdding(true)}>
					<PlusIcon />
				</IconButton>
			</header>
			<div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
				{(adding || empty) && (
					<Item
						className="gap-3 p-2 surface-sidebar-active"
						render={
							<form
								onSubmit={(event) => {
									event.preventDefault();
									if (draft && !create.isPending) {
										create.mutate({ name });
									}
								}}
							/>
						}
					>
						{draft ? (
							<Avatar name={draft} state="idle" size={AVATAR} look="sidebar" />
						) : (
							<span className="size-12 shrink-0 rounded-full border-2 border-dashed border-muted-foreground/50" aria-hidden />
						)}
						<ItemContent className="min-w-0 gap-0">
							<input
								autoFocus
								maxLength={80}
								value={name}
								placeholder="Nome do bot"
								aria-label="Nome do novo bot"
								autoComplete="off"
								spellCheck={false}
								className="w-full font-medium outline-hidden placeholder:font-normal placeholder:text-muted-foreground"
								onChange={(event) => {
									setName(event.target.value);
									create.reset();
								}}
								onKeyDown={(event) => {
									if (event.key === "Escape" && !empty) {
										event.stopPropagation();
										stopAdding();
										focusComposer();
									}
								}}
								onBlur={() => {
									if (!draft && !empty) {
										stopAdding();
									}
								}}
							/>
							{create.error && <span className="text-xs text-destructive wrap-anywhere">{create.error.message}</span>}
						</ItemContent>
					</Item>
				)}
				{bots?.map((bot) => (
					<ContextMenu key={bot.id}>
						<ContextMenuTrigger>
							<Item
								className="gap-3 p-2 text-left hover:surface-sidebar-hover aria-[current=true]:surface-sidebar-active"
								render={<button type="button" />}
								aria-current={bot.id === selected}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => onSelect(bot.id)}
							>
								<Avatar name={bot.name} state={bot.state} size={AVATAR} look="sidebar" />
								<ItemContent className="min-w-0 gap-0">
									<ItemTitle className="block w-full truncate">{bot.name}</ItemTitle>
									<ItemDescription className="block truncate text-xs">{preview(bot)}</ItemDescription>
								</ItemContent>
								<span className="sr-only">{STATE_LABELS[bot.state]}</span>
							</Item>
						</ContextMenuTrigger>
						<ContextMenuContent>
							<ContextMenuItem variant="destructive" onClick={() => setRemoving(bot)}>
								<Trash2Icon />
								Apagar bot
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				))}
				{error && <p className="p-2 text-xs text-destructive wrap-anywhere">{error.message}</p>}
			</div>
			<footer className="flex shrink-0 px-3 pt-2 pb-3">
				<Settings level={level} onLevel={onLevel} />
			</footer>
			{removing && <Remove bot={removing} onClose={() => setRemoving(null)} />}
		</aside>
	);
}
