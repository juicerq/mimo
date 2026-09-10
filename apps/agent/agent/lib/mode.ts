import { defineState } from "eve/context";
import type { ApprovalStatus } from "eve/tools/approval";

type BotMode = "normal" | "autonomous";

const botMode = defineState<BotMode>("mimo.mode", () => "normal");

export function approveInNormalMode(): ApprovalStatus {
	if (botMode.get() === "normal") {
		return "user-approval";
	}
	return "not-applicable";
}
