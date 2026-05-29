import {
  nextStage as nextTextStage,
  STAGES,
  type TerminalStage,
} from "./stages.ts";
import type { ImageProvider } from "../llm/image-provider.ts";
import type { VisionJudge } from "../llm/vision-judge.ts";
import { ELABORATE_SPEC_STAGE } from "./image/elaborate-spec.ts";
import { makeGenerateStage } from "./image/generate.ts";
import { makeJudgeStage } from "./image/judge.ts";
import { Stage, type StageDef } from "./types.ts";

export enum Modality {
  TEXT_REPORT = "text_report",
  IMAGE = "image",
}

export const IMAGE_STAGE = {
  ELABORATE_SPEC: "elaborate_spec",
  GENERATE: "generate",
  JUDGE: "judge",
} as const;

export type RejectScope = "en" | "zh" | "bundle";

export const IMAGE_MAX_REGEN_ROUNDS = 3;

export interface PipelineStageDeps {
  imageProvider?: ImageProvider;
  visionJudge?: VisionJudge;
}

export interface PipelineDef {
  readonly modality: Modality;
  readonly stageIds: readonly string[];
  stageDef(stageId: string, deps?: PipelineStageDeps): StageDef;
  nextStage(current: string, locales: readonly string[]): string | TerminalStage;
  rewindStageForReject(scope: RejectScope): string;
}

const TEXT_STAGE_IDS = [
  Stage.RESEARCH,
  Stage.DRAFT_EN,
  Stage.EDIT_EN,
  Stage.TRANSLATE_ZH,
] as const;

const IMAGE_STAGE_IDS = [
  IMAGE_STAGE.ELABORATE_SPEC,
  IMAGE_STAGE.GENERATE,
  IMAGE_STAGE.JUDGE,
] as const;

export const PIPELINES: Record<Modality, PipelineDef> = {
  [Modality.TEXT_REPORT]: {
    modality: Modality.TEXT_REPORT,
    stageIds: TEXT_STAGE_IDS,
    stageDef(stageId) {
      if (!hasOwn(STAGES, stageId)) {
        throw new Error(`unknown text stage: ${stageId}`);
      }
      return STAGES[stageId];
    },
    nextStage(current, locales) {
      return nextTextStage(current, locales);
    },
    rewindStageForReject(scope) {
      return scope === "zh" ? Stage.TRANSLATE_ZH : Stage.DRAFT_EN;
    },
  },
  [Modality.IMAGE]: {
    modality: Modality.IMAGE,
    stageIds: IMAGE_STAGE_IDS,
    stageDef(stageId, deps = {}) {
      switch (stageId) {
        case IMAGE_STAGE.ELABORATE_SPEC:
          return ELABORATE_SPEC_STAGE;
        case IMAGE_STAGE.GENERATE:
          if (!deps.imageProvider) {
            throw new Error("image provider is required for generate stage");
          }
          return makeGenerateStage(deps.imageProvider);
        case IMAGE_STAGE.JUDGE:
          if (!deps.visionJudge) {
            throw new Error("vision judge is required for judge stage");
          }
          return makeJudgeStage(deps.visionJudge);
        default:
          throw new Error(`unknown image stage: ${stageId}`);
      }
    },
    nextStage(current) {
      switch (current) {
        case IMAGE_STAGE.ELABORATE_SPEC:
          return IMAGE_STAGE.GENERATE;
        case IMAGE_STAGE.GENERATE:
          return IMAGE_STAGE.JUDGE;
        case IMAGE_STAGE.JUDGE:
          return "awaiting_approval";
        default:
          throw new Error(`invalid image stage: ${current}`);
      }
    },
    rewindStageForReject() {
      return IMAGE_STAGE.GENERATE;
    },
  },
};

export function getPipeline(modality: Modality | string): PipelineDef {
  if (!hasOwn(PIPELINES, modality)) {
    throw new Error(`unknown modality: ${modality}`);
  }
  return PIPELINES[modality];
}

function hasOwn<T extends object>(object: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(object, key);
}
