import type { LLMProviderError } from "../llm/provider.ts";

export enum Stage {
  RESEARCH = "research",
  DRAFT_EN = "draft_en",
  EDIT_EN = "edit_en",
  TRANSLATE_ZH = "translate_zh",
}

export interface StageRunContext {
  runDir: string;
  cwd?: string;
  timeoutMs: number;
}

export interface StageDef {
  stage: string;
  prompt: string;
  buildPrompt?: (context: StagePromptContext) => string;
  run?: (context: StageRunContext) => Promise<void>;
  timeoutMs: number;
  manifest: ManifestSchema;
}

export interface StagePromptContext {
  stage: string;
  runDir: string;
  cwd?: string;
}

export interface JobContext {
  runDir: string;
  cwd?: string;
}

export interface ManifestSchema {
  rules: ManifestRule[];
}

export type ManifestRule =
  | {
      kind: "file_exists";
      path: string;
    }
  | {
      kind: "file_non_empty";
      path: string;
    }
  | {
      kind: "json_parseable";
      path: string;
    }
  | {
      kind: "sources_provenance_allowlist";
      path: string;
    }
  | {
      kind: "files_match_glob";
      glob: string;
      minCount?: number;
    }
  | {
      kind: "image_exists";
      path: string;
    }
  | {
      kind: "image_dimensions";
      path: string;
      width: number;
      height: number;
    }
  | {
      kind: "image_format";
      path: string;
      formats: readonly string[];
      maxBytes?: number;
    }
  | {
      kind: "judge_verdict_pass";
      path: string;
    };

export type ManifestErrorCode =
  | "MANIFEST_FILE_MISSING"
  | "MANIFEST_FILE_EMPTY"
  | "MANIFEST_JSON_UNPARSEABLE"
  | "MANIFEST_JSON_PROVENANCE_INVALID"
  | "MANIFEST_GLOB_NO_MATCH"
  | "MANIFEST_IMAGE_MISSING"
  | "MANIFEST_IMAGE_DIMENSIONS"
  | "MANIFEST_IMAGE_FORMAT"
  | "MANIFEST_JUDGE_FAILED"
  | "MANIFEST_PATH_OUTSIDE_RUNDIR";

export interface ManifestError {
  readonly name: "ManifestError";
  readonly errorCode: ManifestErrorCode;
  readonly message: string;
  readonly rule: ManifestRule;
  readonly path?: string;
  readonly pattern?: string;
  readonly cause?: unknown;
}

interface StageResultBase {
  stage: string;
  runDir: string;
  elapsedMs: number;
}

export type StageResult =
  | (StageResultBase & {
      status: "ok";
      output: string;
    })
  | (StageResultBase & {
      status: "error";
      error: LLMProviderError;
    })
  | (StageResultBase & {
      status: "manifest_invalid";
      error: ManifestError;
    });
