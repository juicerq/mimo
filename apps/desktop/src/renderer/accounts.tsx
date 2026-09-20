import type { LoginPrompt, LoginTarget } from "@agent/login/login";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Field } from "@renderer/components/setting";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { useLogins, type Login } from "./logins";
import { orpc, type Outputs } from "./rpc";

const GROUPS = [
	{ id: "provider", name: "Modelos" },
	{ id: "plugin", name: "Apps" },
] as const;

type Target = Outputs["login"]["targets"][number];

function Ask({ target, prompt }: { target: LoginTarget; prompt: LoginPrompt }) {
	const answer = useMutation(orpc.login.answer.mutationOptions());
	const [text, setText] = useState("");

	if (answer.isSuccess) {
		return <p className="text-xs text-muted-foreground">Esperando…</p>;
	}

	if (prompt.kind === "select") {
		return (
			<div className="space-y-1.5">
				<p className="text-xs">{prompt.message}</p>
				<div className="flex flex-wrap gap-1.5">
					{prompt.options.map((option, index) => (
						<Button key={option.id} size="sm" variant="outline" onClick={() => answer.mutate({ target, text: String(index + 1) })}>
							{option.label}
						</Button>
					))}
				</div>
			</div>
		);
	}

	return (
		<form
			className="space-y-1.5"
			onSubmit={(event) => {
				event.preventDefault();
				if (text.trim()) {
					answer.mutate({ target, text });
				}
			}}
		>
			<p className="text-xs">{prompt.message}</p>
			<div className="flex gap-1.5">
				<Input
					autoFocus
					aria-label={prompt.message}
					type={prompt.kind === "secret" ? "password" : "text"}
					value={text}
					spellCheck={false}
					className="h-7 text-sm"
					onChange={(event) => setText(event.target.value)}
				/>
				<Button size="sm" type="submit" disabled={!text.trim()}>
					Enviar
				</Button>
			</div>
		</form>
	);
}

function Flow({ target, login }: { target: LoginTarget; login: Login }) {
	const cancel = useMutation(orpc.login.cancel.mutationOptions());
	const note = login.notes.at(-1);

	return (
		<div className="mt-2 space-y-2 rounded-lg border p-3">
			{note && <p className="text-xs text-muted-foreground">{note}</p>}
			{login.url && !login.failed && (
				<div className="space-y-1.5">
					<Button size="sm" variant="outline" render={<a href={login.url.link} target="_blank" rel="noreferrer" />}>
						Abrir no navegador
					</Button>
					{login.url.instructions && <p className="text-xs text-muted-foreground">{login.url.instructions}</p>}
				</div>
			)}
			{login.prompt && <Ask key={login.prompt.message} target={target} prompt={login.prompt} />}
			{login.failed && <p className="text-xs text-destructive wrap-anywhere">{login.failed}</p>}
			{login.state === "running" && (
				<Button size="sm" variant="ghost" onClick={() => cancel.mutate({ target })}>
					Cancelar
				</Button>
			)}
		</div>
	);
}

function Row({ target, status, login, children }: { target: Target; status: string; login: Login | undefined; children?: ReactNode }) {
	const start = useMutation(orpc.login.start.mutationOptions());
	const busy = login?.state === "running";

	return (
		<div className="border-b py-3 last:border-b-0">
			<div className="flex items-center gap-3">
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm">{target.name}</p>
					<p className="truncate text-xs text-muted-foreground">{status}</p>
				</div>
				<Button size="sm" variant="outline" disabled={busy} onClick={() => start.mutate({ target: target.id })}>
					{login?.failed ? "Tentar de novo" : "Entrar"}
				</Button>
			</div>
			{children}
			{login && (login.state === "running" || login.failed) && <Flow target={target.id} login={login} />}
			{start.error && <p className="mt-2 text-xs text-destructive wrap-anywhere">{start.error.message}</p>}
		</div>
	);
}

function Mailboxes({ emails }: { emails: string[] }) {
	const queryClient = useQueryClient();
	const disconnect = useMutation(orpc.accounts.disconnect.mutationOptions({
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.accounts.list.key() });
		},
	}));

	return (
		<div className="mt-2 space-y-1">
			{emails.map((email) => (
				<div key={email} className="flex items-center gap-2 rounded-lg bg-muted/50 py-1 pr-1 pl-2.5">
					<span className="min-w-0 flex-1 truncate text-xs">{email}</span>
					<Button size="xs" variant="ghost" disabled={disconnect.isPending} onClick={() => disconnect.mutate({ email })}>
						Desconectar
					</Button>
				</div>
			))}
			{disconnect.error && <p className="text-xs text-destructive wrap-anywhere">{disconnect.error.message}</p>}
		</div>
	);
}

export function Accounts() {
	const queryClient = useQueryClient();
	const logins = useLogins();
	const targets = useQuery(orpc.login.targets.queryOptions());
	const catalog = useQuery(orpc.bot.models.queryOptions());
	const emails = useQuery(orpc.accounts.list.queryOptions());
	const settled = Object.values(logins).filter((login) => login.state === "done").map((login) => login.run).join(",");

	useEffect(() => {
		if (!settled) {
			return;
		}
		void queryClient.invalidateQueries({ queryKey: orpc.accounts.list.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.bot.models.key() });
	}, [settled, queryClient]);

	const broken = new Set<string>(catalog.data?.errors.map((entry) => entry.provider));

	function providerStatus(target: Target): string {
		if (!catalog.data) {
			return target.how;
		}
		if (broken.has(target.id)) {
			return `Não conectado · ${target.how}`;
		}
		return `Conectado · ${target.how}`;
	}

	return (
		<>
			{GROUPS.map((group) => (
				<Field key={group.id} label={group.name}>
					{targets.data?.filter((target) => target.group === group.id).map((target) => (
						<Row
							key={target.id}
							target={target}
							status={target.id === "gmail" ? `${emails.data?.length ?? 0} conta(s) · ${target.how}` : providerStatus(target)}
							login={logins[target.id]}
						>
							{target.id === "gmail" && emails.data && emails.data.length > 0 && <Mailboxes emails={emails.data} />}
						</Row>
					))}
				</Field>
			))}
			{targets.error && <p className="mt-5 text-xs text-destructive wrap-anywhere">{targets.error.message}</p>}
		</>
	);
}
