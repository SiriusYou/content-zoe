import type { LLMProviderError } from "../llm/provider.ts";

export enum Stage {
  RESEARCH = "research",
  DRAFT_EN = "draft_en",
  EDIT_EN = "edit_en",
  TRANSLATE_ZH = "translate_zh",
}

export interface StageDef {
  stage: Stage;
  prompt: string;
  timeoutMs: number;
  manifest: ManifestSchema;
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
      kind: "files_match_glob";
      glob: string;
      minCount?: number;
    };

export type ManifestErrorCode =
  | "MANIFEST_FILE_MISSING"
  | "MANIFEST_FILE_EMPTY"
  | "MANIFEST_JSON_UNPARSEABLE"
  | "MANIFEST_GLOB_NO_MATCH"
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
  stage: Stage;
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
