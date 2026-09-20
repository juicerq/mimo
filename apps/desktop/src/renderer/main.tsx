import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@renderer/components/ui/tooltip";
import { App } from "./app";
import "./styles.css";

const root = document.querySelector("#root");

if (!root) {
	throw new Error("The page has no #root element.");
}

createRoot(root).render(
	<StrictMode>
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } } })}>
			<TooltipProvider delay={200} closeDelay={80} timeout={800}>
				<App />
			</TooltipProvider>
		</QueryClientProvider>
	</StrictMode>,
);
