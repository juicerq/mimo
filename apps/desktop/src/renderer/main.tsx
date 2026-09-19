import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";

const root = document.querySelector("#root");

if (!root) {
	throw new Error("The page has no #root element.");
}

createRoot(root).render(
	<StrictMode>
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } } })}>
			<App />
		</QueryClientProvider>
	</StrictMode>,
);
