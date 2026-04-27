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
// Pass condition (Gate 1 hardened): the smoke counts only structured Codex
// JSONL tool events whose nested `item.type === "web_search"` — substring
// matching against serialized lines is explicitly rejected. The `codex exec`
// child is bounded by a timeout (default 90s) and killed on expiry with a
// clear failure summary.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

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

async function main(): Promise<void> {
  const preflight = assertCodexAvailable();
  console.log(`[codex-smoke] codex preflight: ${preflight.raw}`);
  console.log(`[codex-smoke] timeout budget: ${TIMEOUT_MS}ms`);

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

  const proc = Bun.spawn({
    cmd,
    stdout: Bun.file(transcriptPath),
    stderr: Bun.file(stderrPath),
  });

  let timedOut = false;
  const startedAt = Date.now();
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    console.error(
      `[codex-smoke] timeout after ${TIMEOUT_MS}ms — killing codex child (pid=${proc.pid ?? "?"})`,
    );
    try {
      proc.kill("SIGKILL");
    } catch (err) {
      console.error(
        `[codex-smoke] kill failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, TIMEOUT_MS);

  let exitCode: number | null = null;
  try {
    exitCode = await proc.exited;
  } finally {
    clearTimeout(timeoutHandle);
  }
  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[codex-smoke] codex exit code: ${exitCode} (elapsed=${elapsedMs}ms, timedOut=${timedOut})`,
  );

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
    exitCode === 0 &&
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
    timeoutMs: TIMEOUT_MS,
    timedOut,
    elapsedMs,
    exitCode,
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
      console.error(
        `[codex-smoke] FAIL — codex exec exceeded ${TIMEOUT_MS}ms; child was killed. ` +
          `transcriptBytes=${transcriptSize} structuredWebSearchEvents=${jsonl.webSearchEvents} findingsExists=${findingsExists}`,
      );
    } else {
      console.error(
        `[codex-smoke] FAIL — exit=${exitCode} findings=${findingsExists} bytes=${findingsSize} structuredWebSearchEvents=${jsonl.webSearchEvents}`,
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
