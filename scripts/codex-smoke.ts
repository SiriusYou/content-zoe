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
  webSearchSamples: Array<{ line: number; preview: string }>;
  eventTypeCounts: Record<string, number>;
}

function summarizeJsonl(text: string): JsonlSummary {
  const lines = text.split("\n");
  let totalLines = 0;
  let parsedLines = 0;
  let parseErrors = 0;
  let webSearchEvents = 0;
  const webSearchSamples: Array<{ line: number; preview: string }> = [];
  const eventTypeCounts: Record<string, number> = {};

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
    const flat = JSON.stringify(parsed).toLowerCase();
    const obj = parsed as Record<string, unknown>;
    const eventType =
      (typeof obj.type === "string" && obj.type) ||
      (typeof obj.event === "string" && obj.event) ||
      (typeof (obj as { msg?: { type?: string } }).msg?.type === "string" &&
        (obj as { msg?: { type?: string } }).msg!.type!) ||
      "unknown";
    eventTypeCounts[eventType] = (eventTypeCounts[eventType] ?? 0) + 1;
    if (flat.includes("web_search")) {
      webSearchEvents++;
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
    webSearchSamples,
    eventTypeCounts,
  };
}

async function main(): Promise<void> {
  const preflight = assertCodexAvailable();
  console.log(`[codex-smoke] codex preflight: ${preflight.raw}`);

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

  const exitCode = await proc.exited;
  console.log(`[codex-smoke] codex exit code: ${exitCode}`);

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
    `[codex-smoke] transcript: lines=${jsonl.totalLines} parsed=${jsonl.parsedLines} web_search=${jsonl.webSearchEvents}`,
  );
  console.log(
    `[codex-smoke] findings.md: exists=${findingsExists} bytes=${findingsSize}`,
  );
  console.log(`[codex-smoke] summary written: ${summaryPath}`);

  if (!pass) {
    console.error(
      `[codex-smoke] FAIL — exit=${exitCode} findings=${findingsExists} bytes=${findingsSize} web_search=${jsonl.webSearchEvents}`,
    );
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
