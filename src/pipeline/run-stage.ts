import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";

import {
  LLMProviderError,
  type LLMProvider,
} from "../llm/provider.ts";
import { validateSourcesProvenanceText } from "../lib/sources-provenance.ts";
import {
  type JobContext,
  type ManifestError,
  type ManifestErrorCode,
  type ManifestRule,
  type StageDef,
  type StageResult,
} from "./types.ts";

interface ValidRunDir {
  canonicalRunDir: string;
}

interface FileCandidate {
  absPath: string;
  relPath: string;
}

type PathManifestRule = Extract<ManifestRule, { path: string }>;

// runStage depends only on src/llm/provider.ts:LLMProvider. It inherits Slice 2's
// constructor-injection/no-env-reads pattern so subprocess work remains provider-owned.
export async function runStage(
  stageDef: StageDef,
  provider: LLMProvider | undefined,
  jobContext: JobContext,
): Promise<StageResult> {
  const startedAt = Date.now();
  const preflight = validateRunDir(jobContext);
  if (preflight instanceof LLMProviderError) {
    return {
      status: "error",
      stage: stageDef.stage,
      runDir: jobContext.runDir,
      elapsedMs: elapsedSince(startedAt),
      error: preflight,
    };
  }

  const { canonicalRunDir } = preflight;

  if (stageDef.run) {
    try {
      await stageDef.run({
        runDir: canonicalRunDir,
        cwd: jobContext.cwd,
        timeoutMs: stageDef.timeoutMs,
      });
      const manifestError = validateManifest(
        stageDef.manifest.rules,
        canonicalRunDir,
      );
      if (manifestError) {
        return {
          status: "manifest_invalid",
          stage: stageDef.stage,
          runDir: canonicalRunDir,
          elapsedMs: elapsedSince(startedAt),
          error: manifestError,
        };
      }

      return {
        status: "ok",
        stage: stageDef.stage,
        runDir: canonicalRunDir,
        elapsedMs: elapsedSince(startedAt),
        output: "",
      };
    } catch (err) {
      const error =
        err instanceof LLMProviderError
          ? err
          : new LLMProviderError({
              kind: "spawn",
              message: `runStage internal: ${formatThrown(err)}`,
              cause: err,
            });
      return {
        status: "error",
        stage: stageDef.stage,
        runDir: canonicalRunDir,
        elapsedMs: elapsedSince(startedAt),
        error,
      };
    }
  }

  if (!provider) {
    return {
      status: "error",
      stage: stageDef.stage,
      runDir: canonicalRunDir,
      elapsedMs: elapsedSince(startedAt),
      error: new LLMProviderError({
        kind: "spawn",
        message: "runStage internal: LLMProvider required for non-run stage",
      }),
    };
  }

  let providerPrompt: string;
  try {
    providerPrompt = stageDef.buildPrompt
      ? stageDef.buildPrompt({
          stage: stageDef.stage,
          runDir: canonicalRunDir,
          cwd: jobContext.cwd,
        })
      : stageDef.prompt;
  } catch (err) {
    const error =
      err instanceof LLMProviderError
        ? err
        : new LLMProviderError({
            kind: "spawn",
            message: `runStage internal: prompt construction failed: ${formatThrown(err)}`,
            cause: err,
          });
    return {
      status: "error",
      stage: stageDef.stage,
      runDir: canonicalRunDir,
      elapsedMs: elapsedSince(startedAt),
      error,
    };
  }

  try {
    const output = await provider.runPrompt(
      providerPrompt,
      canonicalRunDir,
      stageDef.timeoutMs,
    );
    const manifestError = validateManifest(
      stageDef.manifest.rules,
      canonicalRunDir,
    );
    if (manifestError) {
      return {
        status: "manifest_invalid",
        stage: stageDef.stage,
        runDir: canonicalRunDir,
        elapsedMs: elapsedSince(startedAt),
        error: manifestError,
      };
    }

    return {
      status: "ok",
      stage: stageDef.stage,
      runDir: canonicalRunDir,
      elapsedMs: elapsedSince(startedAt),
      output,
    };
  } catch (err) {
    const error =
      err instanceof LLMProviderError
        ? err
        : new LLMProviderError({
            kind: "spawn",
            message: `runStage internal: ${formatThrown(err)}`,
            cause: err,
          });
    return {
      status: "error",
      stage: stageDef.stage,
      runDir: canonicalRunDir,
      elapsedMs: elapsedSince(startedAt),
      error,
    };
  }
}

function validateRunDir(jobContext: JobContext): ValidRunDir | LLMProviderError {
  try {
    if (!existsSync(jobContext.runDir)) {
      return invalidRunDir(`missing: ${jobContext.runDir}`);
    }

    const canonicalRunDir = realpathSync(jobContext.runDir);
    const runDirStat = statSync(canonicalRunDir);
    if (!runDirStat.isDirectory()) {
      return invalidRunDir(`not a directory: ${jobContext.runDir}`);
    }

    if (jobContext.cwd !== undefined) {
      const canonicalCwd = realpathSync(jobContext.cwd);
      if (!isInside(canonicalRunDir, canonicalCwd)) {
        return invalidRunDir(
          `runDir escapes cwd: runDir=${canonicalRunDir} cwd=${canonicalCwd}`,
        );
      }
    }

    return { canonicalRunDir };
  } catch (err) {
    return invalidRunDir(formatThrown(err), err);
  }
}

function invalidRunDir(reason: string, cause?: unknown): LLMProviderError {
  return new LLMProviderError({
    kind: "spawn",
    message: `runStage internal: invalid runDir: ${reason}`,
    cause,
  });
}

function validateManifest(
  rules: readonly ManifestRule[],
  canonicalRunDir: string,
): ManifestError | undefined {
  for (const rule of rules) {
    const error = validateManifestRule(rule, canonicalRunDir);
    if (error) return error;
  }
  return undefined;
}

function validateManifestRule(
  rule: ManifestRule,
  canonicalRunDir: string,
): ManifestError | undefined {
  if (rule.kind === "files_match_glob") {
    return validateGlobRule(rule, canonicalRunDir);
  }

  const boundary = resolvePathRule(rule, canonicalRunDir);
  if (!boundary.inside) {
    return manifestError(
      "MANIFEST_PATH_OUTSIDE_RUNDIR",
      `manifest path is outside runDir: ${rule.path}`,
      rule,
      { path: boundary.absPath, cause: boundary.cause },
    );
  }
  if (!boundary.exists) {
    const imageMissing = isImagePathRule(rule);
    return manifestError(
      imageMissing ? "MANIFEST_IMAGE_MISSING" : "MANIFEST_FILE_MISSING",
      imageMissing
        ? `manifest image is missing: ${rule.path}`
        : `manifest file is missing: ${rule.path}`,
      rule,
      { path: boundary.absPath, cause: boundary.cause },
    );
  }

  if (rule.kind === "file_exists") return undefined;

  const stats = statSync(boundary.realPath);
  if (!stats.isFile()) {
    const imageMissing = isImagePathRule(rule);
    return manifestError(
      imageMissing ? "MANIFEST_IMAGE_MISSING" : "MANIFEST_FILE_MISSING",
      imageMissing
        ? `manifest image path is not a file: ${rule.path}`
        : `manifest path is not a file: ${rule.path}`,
      rule,
      { path: boundary.realPath },
    );
  }

  if (rule.kind === "file_non_empty") {
    if (stats.size === 0) {
      return manifestError(
        "MANIFEST_FILE_EMPTY",
        `manifest file is empty: ${rule.path}`,
        rule,
        { path: boundary.realPath },
      );
    }
    return undefined;
  }

  if (rule.kind === "image_exists") return undefined;

  if (rule.kind === "image_format") {
    return validateImageFormatRule(rule, boundary.realPath, stats.size);
  }

  if (rule.kind === "image_dimensions") {
    return validateImageDimensionsRule(rule, boundary.realPath);
  }

  if (rule.kind === "judge_verdict_pass") {
    return validateJudgeVerdictRule(rule, boundary.realPath);
  }

  try {
    const text = readFileSync(boundary.realPath, "utf8");
    JSON.parse(text);
    if (rule.kind === "sources_provenance_allowlist") {
      const validation = validateSourcesProvenanceText(text, rule.path);
      if (!validation.ok) {
        return manifestError(
          "MANIFEST_JSON_PROVENANCE_INVALID",
          validation.message ?? `manifest provenance is invalid: ${rule.path}`,
          rule,
          { path: boundary.realPath, cause: validation.cause },
        );
      }
    }
    return undefined;
  } catch (err) {
    return manifestError(
      "MANIFEST_JSON_UNPARSEABLE",
      `manifest file is not parseable JSON: ${rule.path}`,
      rule,
      { path: boundary.realPath, cause: err },
    );
  }
}

function resolvePathRule(
  rule: PathManifestRule,
  canonicalRunDir: string,
): {
  absPath: string;
  realPath: string;
  exists: boolean;
  inside: boolean;
  cause?: unknown;
} {
  const absPath = path.resolve(canonicalRunDir, rule.path);
  try {
    const realPath = realpathSync(absPath);
    return {
      absPath,
      realPath,
      exists: true,
      inside: isInside(realPath, canonicalRunDir),
    };
  } catch (err) {
    return {
      absPath,
      realPath: absPath,
      exists: false,
      inside: isInside(absPath, canonicalRunDir),
      cause: err,
    };
  }
}

function validateImageFormatRule(
  rule: Extract<ManifestRule, { kind: "image_format" }>,
  realPath: string,
  size: number,
): ManifestError | undefined {
  if (rule.formats.length !== 1 || rule.formats[0] !== "png") {
    return manifestError(
      "MANIFEST_IMAGE_FORMAT",
      `manifest image_format supports only png: ${rule.path}`,
      rule,
      { path: realPath },
    );
  }

  if (rule.maxBytes !== undefined && size > rule.maxBytes) {
    return manifestError(
      "MANIFEST_IMAGE_FORMAT",
      `manifest image exceeds maxBytes ${rule.maxBytes}: ${rule.path} (${size} bytes)`,
      rule,
      { path: realPath },
    );
  }

  const bytes = readFileSync(realPath);
  if (!isPng(bytes)) {
    return manifestError(
      "MANIFEST_IMAGE_FORMAT",
      `manifest image is not png: ${rule.path}`,
      rule,
      { path: realPath },
    );
  }

  return undefined;
}

function validateImageDimensionsRule(
  rule: Extract<ManifestRule, { kind: "image_dimensions" }>,
  realPath: string,
): ManifestError | undefined {
  const dimensions = readPngDimensions(readFileSync(realPath));
  if (!dimensions) {
    return manifestError(
      "MANIFEST_IMAGE_DIMENSIONS",
      `manifest image dimensions require png IHDR: ${rule.path}`,
      rule,
      { path: realPath },
    );
  }

  if (dimensions.width !== rule.width || dimensions.height !== rule.height) {
    return manifestError(
      "MANIFEST_IMAGE_DIMENSIONS",
      `manifest image dimensions mismatch for ${rule.path}: expected ${rule.width}x${rule.height}, got ${dimensions.width}x${dimensions.height}`,
      rule,
      { path: realPath },
    );
  }

  return undefined;
}

function validateJudgeVerdictRule(
  rule: Extract<ManifestRule, { kind: "judge_verdict_pass" }>,
  realPath: string,
): ManifestError | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(realPath, "utf8"));
  } catch (err) {
    return manifestError(
      "MANIFEST_JSON_UNPARSEABLE",
      `judge verdict is not parseable JSON: ${rule.path}`,
      rule,
      { path: realPath, cause: err },
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("overallPass" in parsed) ||
    parsed.overallPass !== true
  ) {
    return manifestError(
      "MANIFEST_JUDGE_FAILED",
      `judge verdict did not pass: ${rule.path}`,
      rule,
      { path: realPath },
    );
  }

  return undefined;
}

function isImagePathRule(rule: ManifestRule): boolean {
  return (
    rule.kind === "image_exists" ||
    rule.kind === "image_dimensions" ||
    rule.kind === "image_format"
  );
}

function isPng(bytes: Buffer): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return signature.every((byte, index) => bytes[index] === byte);
}

function readPngDimensions(
  bytes: Buffer,
): { width: number; height: number } | undefined {
  if (bytes.length < 24 || !isPng(bytes)) return undefined;
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return undefined;

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function validateGlobRule(
  rule: Extract<ManifestRule, { kind: "files_match_glob" }>,
  canonicalRunDir: string,
): ManifestError | undefined {
  if (path.isAbsolute(rule.glob) || hasParentSegment(rule.glob)) {
    return manifestError(
      "MANIFEST_PATH_OUTSIDE_RUNDIR",
      `manifest glob is outside runDir: ${rule.glob}`,
      rule,
      { pattern: rule.glob },
    );
  }

  const matcher = globMatcher(rule.glob);
  const minCount = rule.minCount ?? 1;
  let safeCount = 0;

  for (const candidate of listFileCandidates(canonicalRunDir)) {
    if (!matcher(candidate.relPath)) continue;

    let realPath: string;
    try {
      realPath = realpathSync(candidate.absPath);
    } catch (err) {
      if (isNotFoundError(err)) {
        return manifestError(
          "MANIFEST_FILE_MISSING",
          `manifest glob match is missing: ${candidate.relPath}`,
          rule,
          { path: candidate.absPath, pattern: rule.glob, cause: err },
        );
      }
      throw err;
    }

    if (!isInside(realPath, canonicalRunDir)) {
      return manifestError(
        "MANIFEST_PATH_OUTSIDE_RUNDIR",
        `manifest glob match is outside runDir: ${candidate.relPath}`,
        rule,
        { path: realPath, pattern: rule.glob },
      );
    }

    safeCount++;
  }

  if (safeCount >= minCount) return undefined;

  return manifestError(
    "MANIFEST_GLOB_NO_MATCH",
    `manifest glob matched ${safeCount} files, expected at least ${minCount}: ${rule.glob}`,
    rule,
    { pattern: rule.glob },
  );
}

function listFileCandidates(canonicalRunDir: string): FileCandidate[] {
  const candidates: FileCandidate[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absPath);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        candidates.push({
          absPath,
          relPath: toPosixRelative(path.relative(canonicalRunDir, absPath)),
        });
      }
    }
  };

  visit(canonicalRunDir);
  return candidates;
}

function globMatcher(pattern: string): (relPath: string) => boolean {
  const normalized = toPosixRelative(pattern);
  let source = "^";
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === "*" && next === "*") {
      const after = normalized[i + 2];
      if (after === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i++;
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegex(char);
    }
  }
  source += "$";
  const regex = new RegExp(source);
  return (relPath) => regex.test(relPath);
}

function hasParentSegment(input: string): boolean {
  return toPosixRelative(input).split("/").includes("..");
}

function toPosixRelative(input: string): string {
  return input.split(path.sep).join("/");
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "ENOENT";
}

function manifestError(
  errorCode: ManifestErrorCode,
  message: string,
  rule: ManifestRule,
  options: {
    path?: string;
    pattern?: string;
    cause?: unknown;
  } = {},
): ManifestError {
  return {
    name: "ManifestError",
    errorCode,
    message,
    rule,
    path: options.path,
    pattern: options.pattern,
    cause: options.cause,
  };
}

function elapsedSince(startedAt: number): number {
  return Date.now() - startedAt;
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    const json = JSON.stringify(err);
    if (json !== undefined) return json;
  } catch {
  }
  return String(err);
}

function escapeRegex(input: string): string {
  return input.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
