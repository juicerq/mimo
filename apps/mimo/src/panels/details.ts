import type { ModelInfo } from "@agent/model/types";
import type { Detail } from "../transcript";
import type { Panel } from "../panel";

export interface DetailsSnapshot {
	name: string | null;
	model: ModelInfo | null;
	detail: Detail;
	context: string;
}

export function detailsPanel(snapshot: DetailsSnapshot): Panel {
	return {
		heading: "details",
		placeholder: "/cancel to return or press Esc",
		start: (view) => {
			view.line(`bot: ${snapshot.name ?? "—"}`, "item");
			view.line(`model: ${snapshot.model?.name ?? "—"} (${snapshot.model?.reasoning ?? "default"})`, "item");
			view.line(`context: ${snapshot.context}`, "item");
			view.line(`detail: ${snapshot.detail}`, "item");
			view.state("ready");
		},
	};
}
