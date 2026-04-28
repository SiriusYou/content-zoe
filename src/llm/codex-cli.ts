import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { assertCodexAvailable } from "../preflight.ts";
import {
  LLMProvider,
  LLMProviderError,
  QuiescenceProof,
  Snapshot,
  SnapshotEntry,
  TimeoutLifecycle,
} from "./provider.ts";

export type CodexArgvBuilder = (cwd: string, prompt: string) => string[];
type SignalName = "SIGTERM" | "SIGKILL" | string;

interface CodexCliProviderOptions {
  quiesceWindowMs?: number;
  argvBuilder?: CodexArgvBuilder;
}

interface RunTelemetry {
  transcriptDir: string;
  transcriptPath: string;
  stderrPath: string;
  timedOut: boolean;
  lifecycle: TimeoutLifecycle | null;
  quiescence: QuiescenceProof | null;
  exitCode: number | null;
  signal: SignalName | null;
  elapsedMs: number;
  argv: string[];
}

let codexAvailabilityChecked = false;

// Single-spawn invariant: src/preflight.ts:assertCodexAvailable performs
// the Codex CLI version probe and memoizes it for the process. This provider
// must route all availability checks through that function so two runPrompt()
// calls on one CodexCliProvider instance observe exactly one codex --version
// spawn.
function ensureCodexAvailableOnce(): void {
  if (codexAvailabilityChecked) return;
  assertCodexAvailable();
  codexAvailabilityChecked = true;
}

function defaultArgvBuilder(cwd: string, prompt: string): string[] {
  return [
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
    cwd,
    prompt,
  ];
}

function makeTranscriptDir(cwd: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = resolve(cwd, ".runs", stamp);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Provenance: mirrors snapshotAttemptDir from scripts/codex-smoke.ts.
function snapshotAttemptDir(dir: string): Snapshot {
  const files: SnapshotEntry[] = [];

  function walk(current: string, base = ""): void {
    if (!existsSync(current)) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);
      const relPath = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, relPath);
      } else if (entry.isFile()) {
        try {
          const stat = statSync(full);
          files.push({ relPath, bytes: stat.size, mtimeMs: stat.mtimeMs });
        } catch {
          /* file may have been removed mid-snapshot */
        }
      }
    }
  }

  walk(dir);
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  const capturedAtMs = Date.now();
  return {
    capturedAtMs,
    capturedAtIso: new Date(capturedAtMs).toISOString(),
    files,
  };
}

// Provenance: mirrors compareSnapshots from scripts/codex-smoke.ts.
function compareSnapshots(
  before: Snapshot,
  after: Snapshot,
  quiesceWindowMs: number,
): QuiescenceProof {
  const beforeMap = new Map<string, { bytes: number; mtimeMs: number }>();
  for (const file of before.files) {
    beforeMap.set(file.relPath, {
      bytes: file.bytes,
      mtimeMs: file.mtimeMs,
    });
  }

  const changedFiles: QuiescenceProof["changedFiles"] = [];
  const newFiles: SnapshotEntry[] = [];
  for (const file of after.files) {
    const prior = beforeMap.get(file.relPath);
    if (!prior) {
      newFiles.push(file);
    } else if (prior.bytes !== file.bytes || prior.mtimeMs !== file.mtimeMs) {
      changedFiles.push({
        relPath: file.relPath,
        beforeBytes: prior.bytes,
        afterBytes: file.bytes,
        beforeMtimeMs: prior.mtimeMs,
        afterMtimeMs: file.mtimeMs,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function proveQuiescence(
  transcriptDir: string,
  quiesceWindowMs: number,
): Promise<QuiescenceProof> {
  const before = snapshotAttemptDir(transcriptDir);
  if (quiesceWindowMs > 0) {
    await sleep(quiesceWindowMs);
  }
  const after = snapshotAttemptDir(transcriptDir);
  return compareSnapshots(before, after, quiesceWindowMs);
}

function isProcessGroupAlive(pgid: number | null): boolean {
  if (pgid === null || pgid <= 0) return false;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalProcessGroup(
  pgid: number | null,
  signal: "SIGTERM" | "SIGKILL",
): void {
  if (pgid === null || pgid <= 0) return;
  process.kill(-pgid, signal);
}

function reportedExitCode(
  exitCode: number | null,
  signal: SignalName | null,
): number | null {
  if (exitCode !== null) return exitCode;
  if (signal === "SIGTERM") return 143;
  if (signal === "SIGKILL") return 137;
  return null;
}

function coerceString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function extractTextFromAgentMessage(item: Record<string, unknown>): string | null {
  const direct = coerceString(item.text) ?? coerceString(item.output);
  if (direct) return direct;

  const content = item.content;
  if (typeof content === "string") return coerceString(content);
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const obj = part as Record<string, unknown>;
      const text =
        coerceString(obj.text) ??
        coerceString(obj.content) ??
        coerceString(obj.value);
      if (text) parts.push(text);
    }
    return parts.length > 0 ? parts.join("\n") : null;
  }

  const message = item.message;
  if (message && typeof message === "object") {
    return extractTextFromAgentMessage(message as Record<string, unknown>);
  }

  return null;
}

function unwrapEvent(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== "object") return null;
  const direct = parsed as Record<string, unknown>;
  if (typeof direct.type === "string") return direct;

  const msg = direct.msg;
  if (msg && typeof msg === "object") {
    const wrapped = msg as Record<string, unknown>;
    if (typeof wrapped.type === "string") return wrapped;
  }

  return null;
}

function extractCodexError(event: Record<string, unknown>): string | null {
  if (event.type !== "error") return null;
  const direct =
    coerceString(event.message) ??
    coerceString(event.error) ??
    coerceString(event.reason);
  if (direct) return direct;

  const error = event.error;
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    return (
      coerceString(obj.message) ??
      coerceString(obj.type) ??
      coerceString(obj.code) ??
      JSON.stringify(obj)
    );
  }

  return "unknown Codex error event";
}

export function parseAssistantFinalText(jsonl: string): string {
  const messages: string[] = [];
  const lines = jsonl.split("\n");
  let parseErrors = 0;
  let sawTurnCompleted = false;
  const codexErrors: string[] = [];

  for (const raw of lines) {
    if (!raw.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parseErrors++;
      continue;
    }

    const event = unwrapEvent(parsed);
    if (!event) continue;
    if (event.type === "turn.completed") {
      sawTurnCompleted = true;
      continue;
    }

    const codexError = extractCodexError(event);
    if (codexError) {
      codexErrors.push(codexError);
      continue;
    }

    if (event.type !== "item.completed") continue;

    const item = event.item;
    if (!item || typeof item !== "object") continue;
    const itemObj = item as Record<string, unknown>;
    if (itemObj.type !== "agent_message") continue;

    const text = extractTextFromAgentMessage(itemObj);
    if (text) messages.push(text);
  }

  const finalText = messages.at(-1);
  if (codexErrors.length > 0) {
    throw new LLMProviderError({
      kind: "parse",
      message: `codex JSONL contained error event: ${codexErrors.at(-1)}`,
    });
  }
  if (!sawTurnCompleted) {
    throw new LLMProviderError({
      kind: "parse",
      message: "codex JSONL did not contain a turn.completed event",
    });
  }
  if (!finalText) {
    throw new LLMProviderError({
      kind: "parse",
      message:
        `codex JSONL did not contain an item.completed agent_message with text` +
        (parseErrors > 0 ? ` (${parseErrors} malformed JSONL lines skipped)` : ""),
    });
  }

  return finalText;
}

function tail4096(text: string): string {
  return text.length > 4096 ? text.slice(text.length - 4096) : text;
}

export class CodexCliProvider implements LLMProvider {
  readonly name = "codex-cli";
  readonly quiesceWindowMs: number;
  private readonly argvBuilder: CodexArgvBuilder;
  private lastRunTelemetry: RunTelemetry | null = null;

  constructor(options: CodexCliProviderOptions = {}) {
    this.quiesceWindowMs = options.quiesceWindowMs ?? 5000;
    this.argvBuilder = options.argvBuilder ?? defaultArgvBuilder;
  }

  getLastRunTelemetry(): RunTelemetry | null {
    return this.lastRunTelemetry;
  }

  async runPrompt(
    prompt: string,
    cwd: string,
    timeoutMs: number,
  ): Promise<string> {
    ensureCodexAvailableOnce();

    const resolvedCwd = resolve(cwd);
    const transcriptDir = makeTranscriptDir(resolvedCwd);
    const transcriptPath = join(transcriptDir, "transcript.jsonl");
    const stderrPath = join(transcriptDir, "stderr.log");
    const argv = this.argvBuilder(resolvedCwd, prompt);
    const [command, ...args] = argv;
    if (!command) {
      throw new LLMProviderError({
        kind: "spawn",
        message: "codex argv builder returned an empty argv",
        transcriptDir,
      });
    }

    const transcriptChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const transcriptStream = createWriteStream(transcriptPath);
    const stderrStream = createWriteStream(stderrPath);

    let proc;
    try {
      // We intentionally use node:child_process.spawn instead of Bun.spawn.
      // Bun.spawn does not expose detached process groups as of this slice;
      // this mirrors the detached-spawn block in main() of scripts/codex-smoke.ts
      // so negative-PGID SIGTERM/SIGKILL reaches Codex descendants too.
      proc = spawn(command, args, {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      throw new LLMProviderError({
        kind: "spawn",
        message: `failed to spawn ${command}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        transcriptDir,
        cause: err,
      });
    }

    const pgid = typeof proc.pid === "number" ? proc.pid : null;
    const startedAt = Date.now();
    let timedOut = false;
    let lifecycle: TimeoutLifecycle | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    let hardWaitDone = false;
    let resolveHardWait = (): void => {
      hardWaitDone = true;
    };

    const hardWait = new Promise<void>((resolve) => {
      resolveHardWait = () => {
        hardWaitDone = true;
        resolve();
      };
    });

    proc.stdout?.on("data", (chunk: Buffer) => {
      transcriptChunks.push(chunk);
      transcriptStream.write(chunk);
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      stderrStream.write(chunk);
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      lifecycle = "soft-only";
      try {
        signalProcessGroup(pgid, "SIGTERM");
      } catch {
        proc.kill("SIGTERM");
      }

      hardTimer = setTimeout(() => {
        if (isProcessGroupAlive(pgid)) {
          try {
            signalProcessGroup(pgid, "SIGKILL");
            lifecycle = "soft+hard-kill";
          } catch {
            proc.kill("SIGKILL");
            lifecycle = "soft+hard-kill";
          }
        }
        if (!hardWaitDone) resolveHardWait();
      }, 10_000);
    }, timeoutMs);

    const exitResult = await new Promise<{
      exitCode: number | null;
      signal: SignalName | null;
      spawnError: Error | null;
    }>((resolveExit) => {
      proc.once("error", (err: Error) =>
        resolveExit({ exitCode: null, signal: null, spawnError: err }),
      );
      proc.once("exit", (exitCode: number | null, signal: SignalName | null) =>
        resolveExit({ exitCode, signal, spawnError: null }),
      );
    });

    clearTimeout(timeoutHandle);

    if (timedOut) {
      if (!isProcessGroupAlive(pgid)) {
        if (hardTimer) clearTimeout(hardTimer);
        if (!hardWaitDone) resolveHardWait();
      }
      await hardWait;
    } else {
      if (hardTimer) clearTimeout(hardTimer);
      if (!hardWaitDone) resolveHardWait();
    }

    await new Promise<void>((resolveFlush) =>
      transcriptStream.end(() => resolveFlush()),
    );
    await new Promise<void>((resolveFlush) =>
      stderrStream.end(() => resolveFlush()),
    );

    const exitCode = reportedExitCode(exitResult.exitCode, exitResult.signal);
    const elapsedMs = Date.now() - startedAt;
    let quiescence: QuiescenceProof | null = null;
    if (timedOut) {
      quiescence = await proveQuiescence(transcriptDir, this.quiesceWindowMs);
    }

    this.lastRunTelemetry = {
      transcriptDir,
      transcriptPath,
      stderrPath,
      timedOut,
      lifecycle,
      quiescence,
      exitCode,
      signal: exitResult.signal,
      elapsedMs,
      argv,
    };

    if (exitResult.spawnError) {
      throw new LLMProviderError({
        kind: "spawn",
        message: `codex child process error: ${exitResult.spawnError.message}`,
        transcriptDir,
        cause: exitResult.spawnError,
      });
    }

    if (timedOut) {
      if (quiescence && !quiescence.quiet) {
        throw new LLMProviderError({
          kind: "quiescence",
          message:
            `codex timeout left non-quiescent files in ${transcriptDir}: ` +
            `${quiescence.changedFiles.length} changed, ${quiescence.newFiles.length} new`,
          transcriptDir,
          changedFiles: quiescence.changedFiles,
          newFiles: quiescence.newFiles,
          quiescence,
        });
      }
      throw new LLMProviderError({
        kind: "timeout",
        message: `codex prompt exceeded timeout budget ${timeoutMs}ms`,
        lifecycle: lifecycle ?? "soft-only",
        transcriptDir,
        quiescence: quiescence!,
      });
    }

    if (exitCode !== 0) {
      throw new LLMProviderError({
        kind: "exit",
        message: `codex exited with code ${exitCode}`,
        exitCode,
        stderrTail: tail4096(Buffer.concat(stderrChunks).toString("utf8")),
        transcriptDir,
      });
    }

    try {
      return parseAssistantFinalText(
        Buffer.concat(transcriptChunks).toString("utf8"),
      );
    } catch (err) {
      if (err instanceof LLMProviderError) {
        throw new LLMProviderError({
          kind: "parse",
          message: err.message,
          transcriptDir,
          cause: err,
        });
      }
      throw err;
    }
  }
}
