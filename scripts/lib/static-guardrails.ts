import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ForbiddenPattern = readonly [pattern: RegExp, label: string];

export const PROMPT_PRODUCING_SURFACE_PATTERNS: readonly ForbiddenPattern[] = [
  [/src\/prompts|from\s+["'][^"']*\/prompts\//, "prompt import"],
  [/runPrompt|\.runPrompt\s*\(|StageDef\.buildPrompt|<<<|buildPrompt/, "prompt-producing surface"],
];

export const PROMPT_SURFACE_PATTERNS: readonly ForbiddenPattern[] = [
  [/src\/llm|from\s+["'][^"']*\/llm\//, "LLM import"],
  ...PROMPT_PRODUCING_SURFACE_PATTERNS,
];

export const PROCESS_SPAWN_PATTERNS: readonly ForbiddenPattern[] = [
  [
    /(?:from|import)\s+["']node:child_process["']|require\(["']node:child_process["']\)|(?:from|import)\s+["']child_process["']|require\(["']child_process["']\)|\bBun\.spawn\b|\bspawn\s*\(|\bspawnSync\b|\bexecFile\b|\bexecSync\b/,
    "process spawn",
  ],
];

export const TELEGRAM_SDK_IMPORT_PATTERNS: readonly ForbiddenPattern[] = [
  [/from ["'](?:grammy|telegraf)["']|require\(["'](?:grammy|telegraf)["']\)/, "real Telegram SDK import"],
];

export function readRepoSource(repoRoot: string, relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

export function assertNoForbiddenPatterns(
  source: string,
  patterns: readonly ForbiddenPattern[],
  subject: string,
): void {
  for (const [pattern, label] of patterns) {
    if (pattern.test(source)) {
      throw new Error(`${subject} contains forbidden ${label}`);
    }
  }
}

export function changedFilesAgainstBase(
  repoRoot: string,
  targetBase: string,
): string[] {
  const committed = execGit(repoRoot, ["diff", "--name-only", `${targetBase}..HEAD`]);
  const working = execGit(repoRoot, ["status", "--short", "--untracked-files=all"])
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => line.slice(3).trim())
    .map((line) => line.replace(/^.* -> /, ""));

  return [...new Set([...splitLines(committed), ...working])].sort();
}

export function assertChangedFilesWithinScope(
  changed: readonly string[],
  declaredScope: ReadonlySet<string>,
): void {
  const outOfScope = changed.filter((file) => !declaredScope.has(file));
  if (outOfScope.length > 0) {
    throw new Error(`changed files outside declared scope: ${outOfScope.join(", ")}`);
  }
}

export function assertNoChangedFiles(
  changed: readonly string[],
  frozenFiles: readonly string[],
): void {
  for (const frozenFile of frozenFiles) {
    if (changed.includes(frozenFile)) {
      throw new Error(`frozen file changed: ${frozenFile}`);
    }
  }
}

export function assertNoChangedDirectories(
  changed: readonly string[],
  frozenDirectories: readonly string[],
): void {
  const hit = changed.find((file) =>
    frozenDirectories.some((directory) => file.startsWith(directory)),
  );
  if (hit !== undefined) {
    throw new Error(`changed files touched frozen directory scope: ${hit}`);
  }
}

function execGit(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
