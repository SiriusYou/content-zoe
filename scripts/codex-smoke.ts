// cz codex-smoke — Codex web-search smoke runner.
//
// Mirrors PLAN.md Issue 1C exactly in intent: spawn `codex exec --full-auto
// --json --skip-git-repo-check -m gpt-5.4 -c 'model_reasoning_effort="high"'
// -c "mcp_servers={}" -C <attemptDir> "<web-search prompt>"`, capture the
// real JSONL transcript Codex emits to stdout, and verify that
// findings.md was produced via Codex's web-search path.
//
// All runtime artifacts (transcript, stderr log, findings.md, summary.json)
// land under .runs/<id>/ and MUST stay out of git — .runs/ is gitignored.
//
// Pass condition (Gate 2 hardened):
//
//  1. Substring matching against serialized JSONL is rejected. The smoke
//     counts only structured Codex tool events whose nested
//     `item.type === "web_search"` matches the canonical Codex shape.
//  2. `codex exec` is bounded by a timeout (default 180s, override via
//     `CZ_SMOKE_TIMEOUT_MS`). On expiry the runner kills the entire Codex
//     *process group* — not only the immediate Bun child handle — using
//     `process.kill(-pgid, "SIGKILL")` against the detached child's pid.
//     This guarantees that any descendants Codex forked for tool execution
//     (web_search, file_change, command_execution, …) are also terminated.
//  3. After the parent exits we capture two filesystem snapshots of the
//     attempt directory across a quiescence window (default 5s, override
//     via `CZ_SMOKE_QUIESCE_MS`). If any file grows or a new file appears
//     between the snapshots, a descendant survived the kill — the
//     quiescence proof fails and the failure summary records it.
//
// Why a Node `child_process.spawn` instead of `Bun.spawn`? Bun.spawn has no
// `detached: true` switch as of writing. `node:child_process.spawn` is
// supported by Bun and exposes `detached: true`, which calls setsid() so
// the child becomes its own process group leader (PGID === child.pid).
// Killing `-child.pid` then targets the whole group, which is the bug
// Gate 2 caught.

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

import { assertCodexAvailable } from "../src/preflight.ts";

const SMOKE_PROMPT =
  "Search the web for 3 notable AI news items from this week and write them to findings.md";

const DEFAULT_TIMEOUT_MS = 180_000;
const TIMEOUT_MS = (() => {
  const raw = process.env.CZ_SMOKE_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
})();

const DEFAULT_QUIESCE_MS = 5_000;
const POST_KILL_QUIESCE_MS = (() => {
  const raw = process.env.CZ_SMOKE_QUIESCE_MS;
  if (!raw) return DEFAULT_QUIESCE_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_QUIESCE_MS;
})();

function repoRoot(): string {
  // scripts/codex-smoke.ts → repo root is one level up.
  return resolve(dirname(new URL(import.meta.url).pathname), "..");
}

function makeAttemptDir(root: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(root, ".runs", stamp);
  mkdirSync(dir, { recursive: true });
  return dir;
}

interface JsonlSummary {
  totalLines: number;
  parsedLines: number;
  parseErrors: number;
  webSearchEvents: number;
  webSearchStarted: number;
  webSearchCompleted: number;
  webSearchSamples: Array<{ line: number; preview: string }>;
  eventTypeCounts: Record<string, number>;
  itemTypeCounts: Record<string, number>;
}

// Canonical Codex web_search event detector.
//
// Codex emits item-lifecycle events of shape:
//   { type: "item.started"|"item.completed", item: { type: "web_search", ... } }
// Some legacy/wrapped variants nest under `msg`:
//   { msg: { type: "item.completed", item: { type: "web_search", ... } } }
// In both cases the canonical signal is the nested `item.type === "web_search"`,
// NOT a substring match against the serialized line. This guards against
// false-positives like an assistant message that happens to mention
// "web_search" in natural language.
function isWebSearchToolEvent(parsed: unknown): {
  match: boolean;
  phase: "started" | "completed" | "other";
} {
  if (!parsed || typeof parsed !== "object") {
    return { match: false, phase: "other" };
  }
  const obj = parsed as Record<string, unknown>;

  const checkItemContainer = (
    container: Record<string, unknown> | undefined,
    outerType: unknown,
  ): { match: boolean; phase: "started" | "completed" | "other" } => {
    if (!container || typeof container !== "object") {
      return { match: false, phase: "other" };
    }
    const item = (container as { item?: unknown }).item;
    if (!item || typeof item !== "object") {
      return { match: false, phase: "other" };
    }
    const itemType = (item as { type?: unknown }).type;
    if (itemType !== "web_search") {
      return { match: false, phase: "other" };
    }
    const phase: "started" | "completed" | "other" =
      outerType === "item.started"
        ? "started"
        : outerType === "item.completed"
        ? "completed"
        : "other";
    return { match: true, phase };
  };

  // Direct shape: { type, item: { type: "web_search" } }
  const direct = checkItemContainer(obj, obj.type);
  if (direct.match) return direct;

  // Wrapped shape: { msg: { type, item: { type: "web_search" } } }
  const msg = (obj as { msg?: unknown }).msg as
    | Record<string, unknown>
    | undefined;
  if (msg) {
    const wrapped = checkItemContainer(msg, msg.type);
    if (wrapped.match) return wrapped;
  }

  return { match: false, phase: "other" };
}

function summarizeJsonl(text: string): JsonlSummary {
  const lines = text.split("\n");
  let totalLines = 0;
  let parsedLines = 0;
  let parseErrors = 0;
  let webSearchEvents = 0;
  let webSearchStarted = 0;
  let webSearchCompleted = 0;
  const webSearchSamples: Array<{ line: number; preview: string }> = [];
  const eventTypeCounts: Record<string, number> = {};
  const itemTypeCounts: Record<string, number> = {};

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    totalLines++;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
      parsedLines++;
    } catch {
      parseErrors++;
      continue;
    }
    const obj = parsed as Record<string, unknown>;
    const eventType =
      (typeof obj.type === "string" && obj.type) ||
      (typeof obj.event === "string" && obj.event) ||
      (typeof (obj as { msg?: { type?: string } }).msg?.type === "string" &&
        (obj as { msg?: { type?: string } }).msg!.type!) ||
      "unknown";
    eventTypeCounts[eventType] = (eventTypeCounts[eventType] ?? 0) + 1;

    const itemContainer =
      (obj.item as Record<string, unknown> | undefined) ??
      ((obj as { msg?: { item?: unknown } }).msg?.item as
        | Record<string, unknown>
        | undefined);
    if (itemContainer && typeof itemContainer === "object") {
      const itemType =
        typeof itemContainer.type === "string" ? itemContainer.type : "unknown";
      itemTypeCounts[itemType] = (itemTypeCounts[itemType] ?? 0) + 1;
    }

    const detection = isWebSearchToolEvent(parsed);
    if (detection.match) {
      webSearchEvents++;
      if (detection.phase === "started") webSearchStarted++;
      if (detection.phase === "completed") webSearchCompleted++;
      if (webSearchSamples.length < 3) {
        webSearchSamples.push({
          line: i + 1,
          preview: raw.length > 240 ? raw.slice(0, 237) + "..." : raw,
        });
      }
    }
  }

  return {
    totalLines,
    parsedLines,
    parseErrors,
    webSearchEvents,
    webSearchStarted,
    webSearchCompleted,
    webSearchSamples,
    eventTypeCounts,
    itemTypeCounts,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Post-kill quiescence proof.
//
// After we kill the process group, we recursively snapshot the attempt
// directory twice across a fixed window. If anything grows or appears
// between the two snapshots, a descendant Codex process survived the
// SIGKILL and is still mutating files — which is exactly the lifecycle
// failure Gate 2 caught. If both snapshots match, the process group went
// quiet and the bounded-timeout guarantee is honored.
// ──────────────────────────────────────────────────────────────────────────

interface SnapshotEntry {
  relPath: string;
  bytes: number;
  mtimeMs: number;
}

interface DirSnapshot {
  capturedAtMs: number;
  capturedAtIso: string;
  files: SnapshotEntry[];
}

function snapshotAttemptDir(dir: string): DirSnapshot {
  const files: SnapshotEntry[] = [];
  function walk(d: string, base = ""): void {
    if (!existsSync(d)) return;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(d, entry.name);
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        try {
          const s = statSync(full);
          files.push({ relPath: rel, bytes: s.size, mtimeMs: s.mtimeMs });
        } catch {
          /* ignore — file may have been removed mid-walk */
        }
      }
    }
  }
  walk(dir);
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  const now = Date.now();
  return {
    capturedAtMs: now,
    capturedAtIso: new Date(now).toISOString(),
    files,
  };
}

interface QuiescenceProof {
  quiesceWindowMs: number;
  before: DirSnapshot;
  after: DirSnapshot;
  changedFiles: Array<{
    relPath: string;
    beforeBytes: number;
    afterBytes: number;
    beforeMtimeMs: number;
    afterMtimeMs: number;
  }>;
  newFiles: SnapshotEntry[];
  quiet: boolean;
}

function compareSnapshots(
  before: DirSnapshot,
  after: DirSnapshot,
  quiesceWindowMs: number,
): QuiescenceProof {
  const beforeMap = new Map<string, { bytes: number; mtimeMs: number }>();
  for (const f of before.files) {
    beforeMap.set(f.relPath, { bytes: f.bytes, mtimeMs: f.mtimeMs });
  }
  const changedFiles: QuiescenceProof["changedFiles"] = [];
  const newFiles: SnapshotEntry[] = [];
  for (const f of after.files) {
    const prior = beforeMap.get(f.relPath);
    if (!prior) {
      newFiles.push({ relPath: f.relPath, bytes: f.bytes, mtimeMs: f.mtimeMs });
    } else if (prior.bytes !== f.bytes || prior.mtimeMs !== f.mtimeMs) {
      changedFiles.push({
        relPath: f.relPath,
        beforeBytes: prior.bytes,
        afterBytes: f.bytes,
        beforeMtimeMs: prior.mtimeMs,
        afterMtimeMs: f.mtimeMs,
      });
    }
  }
  return {
    quiesceWindowMs,
    before,
    after,
    changedFiles,
    newFiles,
    quiet: changedFiles.length === 0 && newFiles.length === 0,
  };
}

async function main(): Promise<void> {
  const preflight = assertCodexAvailable();
  console.log(`[codex-smoke] codex preflight: ${preflight.raw}`);
  console.log(`[codex-smoke] timeout budget: ${TIMEOUT_MS}ms`);
  console.log(`[codex-smoke] post-kill quiescence window: ${POST_KILL_QUIESCE_MS}ms`);

  const root = repoRoot();
  const attemptDir = makeAttemptDir(root);
  console.log(`[codex-smoke] attempt dir: ${attemptDir}`);

  const transcriptPath = join(attemptDir, "transcript.jsonl");
  const stderrPath = join(attemptDir, "stderr.log");
  const findingsPath = join(attemptDir, "findings.md");
  const summaryPath = join(attemptDir, "summary.json");

  const cmd = [
    "codex",
    "exec",
    "--full-auto",
    "--json",
    "--skip-git-repo-check",
    "-m",
    "gpt-5.4",
    "-c",
    'model_reasoning_effort="high"',
    "-c",
    "mcp_servers={}",
    "-C",
    attemptDir,
    SMOKE_PROMPT,
  ];

  console.log(`[codex-smoke] spawning: ${JSON.stringify(cmd)}`);
  console.log(`[codex-smoke] spawn mode: detached (process group leader, setsid)`);

  // Pipe stdout/stderr to disk via Node streams. We do not use Bun.file()
  // sinks here because we are using node:child_process.spawn for the
  // `detached: true` flag (Bun.spawn lacks it as of writing).
  const transcriptStream = createWriteStream(transcriptPath);
  const stderrStream = createWriteStream(stderrPath);

  // detached: true → child becomes leader of its own process group via
  // setsid(); PGID === child.pid. Killing `-child.pid` then signals every
  // descendant Codex forks for tool execution. This is the Gate 2 fix.
  const proc = spawn(cmd[0], cmd.slice(1), {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout!.pipe(transcriptStream);
  proc.stderr!.pipe(stderrStream);

  const pid = typeof proc.pid === "number" ? proc.pid : null;
  console.log(`[codex-smoke] codex pid (= pgid): ${pid ?? "<unknown>"}`);

  let timedOut = false;
  let killSignal: string | null = null;
  let killTargetPgid: number | null = null;
  let killSentAtMs: number | null = null;
  let killError: string | null = null;
  const startedAt = Date.now();

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    killSentAtMs = Date.now();
    console.error(
      `[codex-smoke] timeout after ${TIMEOUT_MS}ms — killing codex process group (pgid=${pid ?? "?"})`,
    );
    if (typeof pid === "number" && pid > 0) {
      try {
        // Negative pid → kill the whole process group. SIGKILL is
        // unblockable; it will reap Codex and any descendants in one shot.
        process.kill(-pid, "SIGKILL");
        killSignal = "SIGKILL";
        killTargetPgid = pid;
        console.error(
          `[codex-smoke] SIGKILL delivered to process group -${pid}`,
        );
      } catch (err) {
        killError = err instanceof Error ? err.message : String(err);
        console.error(
          `[codex-smoke] process.kill(-${pid}, SIGKILL) failed: ${killError}; falling back to direct child kill`,
        );
        try {
          proc.kill("SIGKILL");
          killSignal = "SIGKILL (direct fallback)";
        } catch (err2) {
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          killError = `pgid kill failed (${killError}); direct kill also failed: ${msg2}`;
        }
      }
    } else {
      killError = "no pid available to target process group";
    }
  }, TIMEOUT_MS);

  const { exitCode, signal } = await new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }>((resolveExit) => {
    proc.on("exit", (code, sig) => resolveExit({ exitCode: code, signal: sig }));
    proc.on("error", (err) => {
      console.error(`[codex-smoke] child error: ${err.message}`);
      resolveExit({ exitCode: null, signal: null });
    });
  });
  clearTimeout(timeoutHandle);

  // Flush both streams before we attempt to read the transcript.
  await new Promise<void>((r) => transcriptStream.end(() => r()));
  await new Promise<void>((r) => stderrStream.end(() => r()));

  const elapsedMs = Date.now() - startedAt;
  // Conventional shell exit code for SIGKILL = 128 + 9 = 137.
  const reportedExitCode =
    exitCode !== null ? exitCode : signal === "SIGKILL" ? 137 : null;
  console.log(
    `[codex-smoke] codex exit: code=${exitCode} signal=${signal ?? "<none>"} reportedExitCode=${reportedExitCode} (elapsed=${elapsedMs}ms, timedOut=${timedOut})`,
  );

  // Post-kill quiescence proof: only meaningful when we actually killed.
  let quiescence: QuiescenceProof | null = null;
  if (timedOut) {
    const before = snapshotAttemptDir(attemptDir);
    console.log(
      `[codex-smoke] post-kill snapshot 1: ${before.files.length} files at ${before.capturedAtIso}`,
    );
    if (POST_KILL_QUIESCE_MS > 0) {
      console.log(
        `[codex-smoke] waiting ${POST_KILL_QUIESCE_MS}ms to detect surviving descendants…`,
      );
      await new Promise((r) => setTimeout(r, POST_KILL_QUIESCE_MS));
    }
    const after = snapshotAttemptDir(attemptDir);
    console.log(
      `[codex-smoke] post-kill snapshot 2: ${after.files.length} files at ${after.capturedAtIso}`,
    );
    quiescence = compareSnapshots(before, after, POST_KILL_QUIESCE_MS);
    if (quiescence.quiet) {
      console.log(
        `[codex-smoke] quiescence: PASS — no file growth or new files in ${POST_KILL_QUIESCE_MS}ms after kill (process group fully terminated)`,
      );
    } else {
      console.error(
        `[codex-smoke] quiescence: FAIL — ${quiescence.changedFiles.length} files changed, ${quiescence.newFiles.length} new files appeared after kill (descendants survived)`,
      );
      for (const c of quiescence.changedFiles) {
        console.error(
          `  changed: ${c.relPath} ${c.beforeBytes}→${c.afterBytes} bytes`,
        );
      }
      for (const n of quiescence.newFiles) {
        console.error(`  new:     ${n.relPath} ${n.bytes} bytes`);
      }
    }
  }

  const transcriptExists = existsSync(transcriptPath);
  const transcriptSize = transcriptExists ? statSync(transcriptPath).size : 0;
  const transcriptText = transcriptExists
    ? readFileSync(transcriptPath, "utf-8")
    : "";

  const jsonl = summarizeJsonl(transcriptText);

  const findingsExists = existsSync(findingsPath);
  const findingsSize = findingsExists ? statSync(findingsPath).size : 0;
  const findingsPreview = findingsExists
    ? readFileSync(findingsPath, "utf-8").slice(0, 800)
    : null;

  const pass =
    !timedOut &&
    reportedExitCode === 0 &&
    findingsExists &&
    findingsSize > 0 &&
    jsonl.parsedLines > 0 &&
    jsonl.webSearchEvents > 0;

  const summary = {
    cmd,
    prompt: SMOKE_PROMPT,
    attemptDir,
    transcriptPath,
    stderrPath,
    findingsPath,
    codexVersionRaw: preflight.raw,
    codexVersion: preflight.version,
    recommendedMajorMinor:
      preflight.major !== null && preflight.minor !== null
        ? `${preflight.major}.${preflight.minor}`
        : null,
    spawn: {
      runtime: "node:child_process",
      detached: true,
      pid,
    },
    timeoutMs: TIMEOUT_MS,
    quiesceWindowMs: POST_KILL_QUIESCE_MS,
    timedOut,
    elapsedMs,
    exitCode: reportedExitCode,
    rawExitCode: exitCode,
    terminationSignal: signal,
    kill: timedOut
      ? {
          targetPgid: killTargetPgid,
          signal: killSignal,
          sentAtMs: killSentAtMs,
          error: killError,
        }
      : null,
    postKillQuiescence: quiescence,
    transcript: {
      exists: transcriptExists,
      bytes: transcriptSize,
      ...jsonl,
    },
    findings: {
      exists: findingsExists,
      bytes: findingsSize,
      preview: findingsPreview,
    },
    pass,
    finishedAt: new Date().toISOString(),
  };

  await Bun.write(summaryPath, JSON.stringify(summary, null, 2));

  console.log(
    `[codex-smoke] transcript: lines=${jsonl.totalLines} parsed=${jsonl.parsedLines} web_search(structured)=${jsonl.webSearchEvents} (started=${jsonl.webSearchStarted} completed=${jsonl.webSearchCompleted})`,
  );
  console.log(
    `[codex-smoke] findings.md: exists=${findingsExists} bytes=${findingsSize}`,
  );
  console.log(`[codex-smoke] summary written: ${summaryPath}`);

  if (!pass) {
    if (timedOut) {
      const quietNote = quiescence
        ? quiescence.quiet
          ? `process group quiet across ${POST_KILL_QUIESCE_MS}ms after kill`
          : `process group NOT quiet (changed=${quiescence.changedFiles.length}, new=${quiescence.newFiles.length})`
        : "no quiescence snapshot taken";
      console.error(
        `[codex-smoke] FAIL — codex exec exceeded ${TIMEOUT_MS}ms; process group SIGKILLed; ${quietNote}. ` +
          `transcriptBytes=${transcriptSize} structuredWebSearchEvents=${jsonl.webSearchEvents} findingsExists=${findingsExists}`,
      );
    } else {
      console.error(
        `[codex-smoke] FAIL — exit=${reportedExitCode} findings=${findingsExists} bytes=${findingsSize} structuredWebSearchEvents=${jsonl.webSearchEvents}`,
      );
    }
    process.exit(1);
  }
  console.log(`[codex-smoke] PASS`);
}

main().catch((err) => {
  console.error(
    `[codex-smoke] error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`,
  );
  process.exit(1);
});
