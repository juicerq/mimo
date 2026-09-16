import { basename } from "node:path";
import type { BotInfo } from "@agent/bot/types";
import type { ModelInfo } from "@agent/model/types";
import type { TeamView } from "../bar";
import type { Detail } from "../transcript";
import type { Panel } from "../panel";

export interface DetailsSnapshot {
	name: string | null;
	model: ModelInfo | null;
	mode: BotInfo["mode"] | null;
	folder: string | null;
	tools: readonly string[];
	detail: Detail;
	team: TeamView;
	context: string;
}

function modeLabel(mode: DetailsSnapshot["mode"]): string {
	if (mode === null) {
		return "—";
	}
	if (mode === "autonomous") {
		return "auto";
	}
	return "normal";
}

export function detailsPanel(snapshot: DetailsSnapshot): Panel {
	return {
		heading: "details",
		placeholder: "/cancel to return or press Esc",
		start: (view) => {
			view.line(`bot: ${snapshot.name ?? "—"}`, "item");
			view.line(`model: ${snapshot.model?.name ?? "—"} (${snapshot.model?.reasoning ?? "default"})`, "item");
			view.line(`context: ${snapshot.context}`, "item");
			view.line(`mode: ${modeLabel(snapshot.mode)}`, "item");
			view.line(`folder: ${snapshot.folder === null ? "—" : basename(snapshot.folder)}`, "item");
			view.line(`tools: ${snapshot.tools.length === 0 ? "none" : snapshot.tools.join(", ")}`, "item");
			view.line(`detail: ${snapshot.detail}`, "item");
			view.line(`team: ${snapshot.team}`, "item");
			view.state("ready");
		},
	};
}
