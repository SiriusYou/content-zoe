import { DRAFT_EN_STAGE } from "./draft-en.ts";
import { EDIT_EN_STAGE } from "./edit-en.ts";
import { RESEARCH_STAGE } from "./research.ts";
import { TRANSLATE_ZH_STAGE } from "./translate-zh.ts";
import { Stage, type StageDef } from "./types.ts";

export const STAGES: Record<Stage, StageDef> = {
  [Stage.RESEARCH]: RESEARCH_STAGE,
  [Stage.DRAFT_EN]: DRAFT_EN_STAGE,
  [Stage.EDIT_EN]: EDIT_EN_STAGE,
  [Stage.TRANSLATE_ZH]: TRANSLATE_ZH_STAGE,
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
