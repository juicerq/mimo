import { defineState } from "eve/context";
import type { ApprovalStatus } from "eve/tools/approval";

export type BotMode = "normal" | "autonomous";

export const botMode = defineState<BotMode>("mimo.mode", () => "normal");

export function approveInNormalMode(): ApprovalStatus {
	if (botMode.get() === "normal") {
		return "user-approval";
	}
	return "not-applicable";
}
