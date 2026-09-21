import { useMutation } from "@tanstack/react-query";
import { Button } from "@renderer/components/ui/button";
import { useBrowsing } from "./browsing";
import { orpc } from "./rpc";

function siteName(url: string): string {
	try {
		return new URL(url).host.replace(/^www\./u, "");
	} catch {
		return url;
	}
}

export function Preview({ botId }: { botId: string }) {
	const browsing = useBrowsing(botId);
	const present = useMutation(orpc.browser.present.mutationOptions());

	if (!browsing) {
		return null;
	}

	return (
		<figure className="mb-5" aria-label="O que o bot está vendo">
			<button
				type="button"
				aria-label="Abrir o navegador"
				onClick={() => present.mutate({ botId, open: true })}
				className="block w-full cursor-pointer overflow-hidden rounded-lg border bg-subtle hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				{browsing.photo ? (
					<img src={browsing.photo} alt="" className="block w-full" />
				) : (
					<div className="aspect-16/10 animate-pulse bg-muted" />
				)}
			</button>
			<figcaption className="mt-1.5 truncate text-xs text-muted-foreground">{browsing.title || siteName(browsing.url)}</figcaption>
		</figure>
	);
}

export function Viewer({ botId }: { botId: string }) {
	const browsing = useBrowsing(botId);
	const answer = useMutation(orpc.browser.answer.mutationOptions());

	if (!browsing?.showing) {
		return null;
	}

	return (
		<div className="fixed inset-x-0 bottom-0 z-40 flex h-13 items-center gap-4 border-t bg-background px-4">
			<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{browsing.url}</span>
			<Button variant="ghost" size="sm" disabled={answer.isPending} onClick={() => answer.mutate({ botId, helped: false })}>
				Deixa pra lá
			</Button>
			<Button size="sm" disabled={answer.isPending} onClick={() => answer.mutate({ botId, helped: true })}>
				Terminei
			</Button>
		</div>
	);
}
