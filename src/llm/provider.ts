export interface LLMProvider {
  readonly name: string;
  runPrompt(prompt: string, cwd: string, timeoutMs: number): Promise<string>;
}

export type LLMProviderErrorKind =
  | "spawn"
  | "timeout"
  | "exit"
  | "parse"
  | "quiescence";

export type TimeoutLifecycle = "soft-only" | "soft+hard-kill";

export interface SnapshotEntry {
  relPath: string;
  bytes: number;
  mtimeMs: number;
}

export interface Snapshot {
  capturedAtMs: number;
  capturedAtIso: string;
  files: SnapshotEntry[];
}

export interface ChangedSnapshotEntry {
  relPath: string;
  beforeBytes: number;
  afterBytes: number;
  beforeMtimeMs: number;
  afterMtimeMs: number;
}

export interface QuiescenceProof {
  quiesceWindowMs: number;
  before: Snapshot;
  after: Snapshot;
  changedFiles: ChangedSnapshotEntry[];
  newFiles: SnapshotEntry[];
  quiet: boolean;
}

export type LLMProviderErrorOptions =
  | {
      kind: "spawn";
      message: string;
      transcriptDir?: string;
      cause?: unknown;
    }
  | {
      kind: "timeout";
      message: string;
      lifecycle: TimeoutLifecycle;
      transcriptDir: string;
      quiescence: QuiescenceProof;
      cause?: unknown;
    }
  | {
      kind: "exit";
      message: string;
      exitCode: number | null;
      stderrTail: string;
      transcriptDir: string;
      cause?: unknown;
    }
  | {
      kind: "parse";
      message: string;
      transcriptDir?: string;
      cause?: unknown;
    }
  | {
      kind: "quiescence";
      message: string;
      transcriptDir: string;
      changedFiles: ChangedSnapshotEntry[];
      newFiles: SnapshotEntry[];
      quiescence: QuiescenceProof;
      cause?: unknown;
    };

export class LLMProviderError extends Error {
  readonly kind: LLMProviderErrorKind;
  readonly lifecycle?: TimeoutLifecycle;
  readonly exitCode?: number | null;
  readonly stderrTail?: string;
  readonly transcriptDir?: string;
  readonly changedFiles?: ChangedSnapshotEntry[];
  readonly newFiles?: SnapshotEntry[];
  readonly quiescence?: QuiescenceProof;
  override readonly cause?: unknown;

  constructor(options: LLMProviderErrorOptions) {
    super(options.message);
    this.name = "LLMProviderError";
    this.kind = options.kind;
    this.cause = options.cause;

    if ("lifecycle" in options) this.lifecycle = options.lifecycle;
    if ("exitCode" in options) this.exitCode = options.exitCode;
    if ("stderrTail" in options) this.stderrTail = options.stderrTail;
    if ("transcriptDir" in options) this.transcriptDir = options.transcriptDir;
    if ("changedFiles" in options) this.changedFiles = options.changedFiles;
    if ("newFiles" in options) this.newFiles = options.newFiles;
    if ("quiescence" in options) this.quiescence = options.quiescence;
  }
}
