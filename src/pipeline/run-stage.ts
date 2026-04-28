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

// runStage depends only on src/llm/provider.ts:LLMProvider. It inherits Slice 2's
// constructor-injection/no-env-reads pattern so subprocess work remains provider-owned.
export async function runStage(
  stageDef: StageDef,
  provider: LLMProvider,
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

  try {
    const output = await provider.runPrompt(
      stageDef.prompt,
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
    return manifestError(
      "MANIFEST_FILE_MISSING",
      `manifest file is missing: ${rule.path}`,
      rule,
      { path: boundary.absPath, cause: boundary.cause },
    );
  }

  if (rule.kind === "file_exists") return undefined;

  const stats = statSync(boundary.realPath);
  if (!stats.isFile()) {
    return manifestError(
      "MANIFEST_FILE_MISSING",
      `manifest path is not a file: ${rule.path}`,
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

  try {
    JSON.parse(readFileSync(boundary.realPath, "utf8"));
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
  rule: Extract<
    ManifestRule,
    { kind: "file_exists" | "file_non_empty" | "json_parseable" }
  >,
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

function validateGlobRule(
  rule: Extract<ManifestRule, { kind: "files_match_glob" }>,
  canonicalRunDir: string,
): ManifestError | undefined {
  if (path.isAbsolute(rule.pattern) || hasParentSegment(rule.pattern)) {
    return manifestError(
      "MANIFEST_PATH_OUTSIDE_RUNDIR",
      `manifest glob is outside runDir: ${rule.pattern}`,
      rule,
      { pattern: rule.pattern },
    );
  }

  const matcher = globMatcher(rule.pattern);
  const minCount = rule.minCount ?? 1;
  let matchCount = 0;

  for (const candidate of listFileCandidates(canonicalRunDir)) {
    if (!matcher(candidate.relPath)) continue;

    const realPath = realpathSync(candidate.absPath);
    if (!isInside(realPath, canonicalRunDir)) {
      return manifestError(
        "MANIFEST_PATH_OUTSIDE_RUNDIR",
        `manifest glob match is outside runDir: ${candidate.relPath}`,
        rule,
        { path: realPath, pattern: rule.pattern },
      );
    }

    matchCount++;
    if (matchCount >= minCount) return undefined;
  }

  return manifestError(
    "MANIFEST_GLOB_NO_MATCH",
    `manifest glob matched ${matchCount} files, expected at least ${minCount}: ${rule.pattern}`,
    rule,
    { pattern: rule.pattern },
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
