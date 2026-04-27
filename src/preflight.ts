// cz preflight — memoized `codex --version` assertion.
//
// Contract: spawn `codex --version` at most once per process. Cache both
// success and failure so subsequent callers (e.g. report-run.ts) see the
// same result without re-spawning. This module is intentionally a pure
// observer: it reads the system, writes nothing to disk, and never
// mutates AGENTS.md or any other policy file.

export interface PreflightResult {
  raw: string;
  version: string | null;
  major: number | null;
  minor: number | null;
  patch: number | null;
}

let memoized: PreflightResult | null = null;
let memoizedError: Error | null = null;
let spawnCount = 0;

const VERSION_RE = /(\d+)\.(\d+)\.(\d+)/;

function parseVersion(raw: string): {
  version: string | null;
  major: number | null;
  minor: number | null;
  patch: number | null;
} {
  const match = raw.match(VERSION_RE);
  if (!match) return { version: null, major: null, minor: null, patch: null };
  const [, maj, min, pat] = match;
  return {
    version: `${maj}.${min}.${pat}`,
    major: Number(maj),
    minor: Number(min),
    patch: Number(pat),
  };
}

export class CodexPreflightError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "CodexPreflightError";
  }
}

export function assertCodexAvailable(): PreflightResult {
  if (memoized) return memoized;
  if (memoizedError) throw memoizedError;

  spawnCount++;
  if (process.env.CZ_PREFLIGHT_DEBUG === "1") {
    console.error(`[preflight] spawning codex --version (call #${spawnCount})`);
  }

  let proc;
  try {
    proc = Bun.spawnSync({
      cmd: ["codex", "--version"],
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (err) {
    memoizedError = new CodexPreflightError(
      `cz preflight failed: codex CLI is missing or unreachable on PATH. ` +
        `Ensure 'codex' is installed and resolvable. ` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
    throw memoizedError;
  }

  const stdout = new TextDecoder().decode(proc.stdout).trim();
  const stderr = new TextDecoder().decode(proc.stderr).trim();

  if (!proc.success || proc.exitCode !== 0) {
    memoizedError = new CodexPreflightError(
      `cz preflight failed: 'codex --version' exited with code ${proc.exitCode}. ` +
        `codex CLI appears to be missing or unreachable. ` +
        `stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)}`,
    );
    throw memoizedError;
  }

  const parsed = parseVersion(stdout);
  memoized = { raw: stdout, ...parsed };
  return memoized;
}

// Test/diagnostic helpers — exported so smoke tooling can prove memoization
// without re-spawning codex.
export function _getSpawnCount(): number {
  return spawnCount;
}

export function _resetForTesting(): void {
  memoized = null;
  memoizedError = null;
  spawnCount = 0;
}

if (import.meta.main) {
  try {
    const result = assertCodexAvailable();
    const recommendedPin =
      result.major !== null && result.minor !== null
        ? `${result.major}.${result.minor}`
        : "unknown";
    console.log(`cz preflight OK`);
    console.log(`  codex --version: ${result.raw}`);
    console.log(`  parsed version : ${result.version ?? "<unparseable>"}`);
    console.log(`  recommended pin: ${recommendedPin}`);
    process.exit(0);
  } catch (err) {
    if (err instanceof CodexPreflightError) {
      console.error(err.message);
    } else {
      console.error(
        `cz preflight failed: unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`,
      );
    }
    process.exit(1);
  }
}
