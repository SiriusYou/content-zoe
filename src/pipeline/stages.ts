import { Stage, type StageDef } from "./types.ts";

export const STAGES: Record<Stage, StageDef> = {
  [Stage.RESEARCH]: {
    stage: Stage.RESEARCH,
    prompt: "Run the research stage.",
    timeoutMs: 1_200_000,
    manifest: { rules: [] },
  },
  [Stage.DRAFT_EN]: {
    stage: Stage.DRAFT_EN,
    prompt: "Run the English draft stage.",
    timeoutMs: 900_000,
    manifest: { rules: [] },
  },
  [Stage.EDIT_EN]: {
    stage: Stage.EDIT_EN,
    prompt: "Run the English edit stage.",
    timeoutMs: 600_000,
    manifest: { rules: [] },
  },
  [Stage.TRANSLATE_ZH]: {
    stage: Stage.TRANSLATE_ZH,
    prompt: "Run the Chinese translation stage.",
    timeoutMs: 600_000,
    manifest: { rules: [] },
  },
};

export type TerminalStage = "awaiting_approval";

export function nextStage(
  current: Stage | string,
  locales: readonly string[],
): Stage | TerminalStage {
  switch (current) {
    case Stage.RESEARCH:
      return Stage.DRAFT_EN;
    case Stage.DRAFT_EN:
      return Stage.EDIT_EN;
    case Stage.EDIT_EN:
      return locales.length === 1 && locales[0] === "en"
        ? "awaiting_approval"
        : Stage.TRANSLATE_ZH;
    case Stage.TRANSLATE_ZH:
      return "awaiting_approval";
    default:
      throw new Error(`invalid current stage: ${current}`);
  }
}
