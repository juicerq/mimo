import { defineState } from "eve/context";

export type BotMode = "normal" | "autonomous";

export const botMode = defineState<BotMode>("mimo.mode", () => "normal");
