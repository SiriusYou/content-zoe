import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertNoForbiddenPatterns,
  PROMPT_PRODUCING_SURFACE_PATTERNS,
  type ForbiddenPattern,
} from "./lib/static-guardrails.ts";
import {
  findJobById,
  insertJob,
  openDb,
  type RowsAffectedResult,
} from "../src/db.ts";
import type { LLMProvider } from "../src/llm/provider.ts";
import {
  persistApprovalSummaryAfterLoop,
  prepareReportRunAttempt,
  recordRecoveryCleanupAudit,
} from "../src/bin/report-run.ts";
import { createReportRunFakeProvider } from "../src/lib/report-run-fake-provider.ts";
import {
  type Locale,
  runReportLoop,
  type ReportLoopResult,
} from "../src/lib/report-loop.ts";
import {
  APPROVAL_SUMMARY_MAX_CHARS,
  composeApprovalSummary,
  TRUNCATION_MARKER,
} from "../src/pipeline/approval-summary.ts";
import { Stage } from "../src/pipeline/types.ts";

type ScenarioName =
  | "compose-bilingual"
  | "compose-en-only"
  | "evidence-grade-warnings"
  | "summary-length-bound"
  | "compose-deterministic"
  | "db-persistence-existing-job"
  | "db-persistence-en-only-existing-job"
  | "stage-failure-no-approval-persistence"
  | "persistence-failure-nonzero"
  | "missing-job-nonfatal"
  | "already-complete-idempotent"
  | "no-prompt-surface-static-check";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: ScenarioName[] = [
  "compose-bilingual",
  "compose-en-only",
  "evidence-grade-warnings",
  "summary-length-bound",
  "compose-deterministic",
  "db-persistence-existing-job",
  "db-persistence-en-only-existing-job",
  "stage-failure-no-approval-persistence",
  "persistence-failure-nonzero",
  "missing-job-nonfatal",
  "already-complete-idempotent",
  "no-prompt-surface-static-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isoStamp = new Date().toISOString().replaceAll(":", "-");
const smokeRoot = resolve(repoRoot, ".runs", "approval-summary-smoke", isoStamp);
const docPath = resolve(repoRoot, "docs", "preflight", "approval-summary-smoke.md");

async function main(): Promise<number> {
  mkdirSync(smokeRoot, { recursive: true });
  const outcomes: ScenarioOutcome[] = [];

  try {
    for (const name of SCENARIOS) {
      outcomes.push(await runScenario(name));
    }
  } finally {
    writeEvidence(outcomes);
    rmSync(smokeRoot, { recursive: true, force: true });
    removeEmptyDir(resolve(repoRoot, ".runs", "approval-summary-smoke"));
    removeEmptyDir(resolve(repoRoot, ".runs"));
  }

  for (const outcome of outcomes) {
    console.log(`${outcome.status} ${outcome.name}`);
    for (const detail of outcome.details) {
      console.log(`  - ${detail}`);
    }
  }

  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  console.log(`${passed}/${SCENARIOS.length} PASS`);
  return passed === SCENARIOS.length ? 0 : 1;
}

async function runScenario(name: ScenarioName): Promise<ScenarioOutcome> {
  const startedAtIso = new Date().toISOString();
  const dir = resolve(smokeRoot, name);
  mkdirSync(dir, { recursive: true });

  try {
    const details = await scenarioImpl(name, dir);
    return {
      name,
      status: "PASS",
      details,
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  } catch (err) {
    return {
      name,
      status: "FAIL",
      details: [formatError(err)],
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  }
}

async function scenarioImpl(
  name: ScenarioName,
  dir: string,
): Promise<string[]> {
  switch (name) {
    case "compose-bilingual":
      return runComposeBilingual();
    case "compose-en-only":
      return runComposeEnOnly();
    case "evidence-grade-warnings":
      return runEvidenceGradeWarnings();
    case "summary-length-bound":
      return runSummaryLengthBound();
    case "compose-deterministic":
      return runComposeDeterministic();
    case "db-persistence-existing-job":
      return runDbPersistenceExistingJob(dir);
    case "db-persistence-en-only-existing-job":
      return runDbPersistenceEnOnlyExistingJob(dir);
    case "stage-failure-no-approval-persistence":
      return runStageFailureNoApprovalPersistence(dir);
    case "persistence-failure-nonzero":
      return runPersistenceFailureNonzero(dir);
    case "missing-job-nonfatal":
      return runMissingJobNonfatal(dir);
    case "already-complete-idempotent":
      return runAlreadyCompleteIdempotent(dir);
    case "no-prompt-surface-static-check":
      return runNoPromptSurfaceStaticCheck();
  }
}

function runComposeBilingual(): string[] {
  const summary = composeApprovalSummary({
    jobId: "compose-bi",
    attemptNumber: 7,
    locales: ["en", "zh"],
    reportEnText: "# English\n\nEnglish preview body.\n",
    reportZhText: "# 中文\n\nChinese preview body.\n",
    paths: {
      reportEn: ".runs/compose-bi/attempt-7/report.en.md",
      reportZh: ".runs/compose-bi/attempt-7/report.zh.md",
      sources: ".runs/compose-bi/attempt-7/sources.json",
    },
  });

  assert(summary.includes("Job ID: compose-bi"), "missing job id");
  assert(summary.includes("Attempt: 7"), "missing attempt number");
  assert(summary.includes(".runs/compose-bi/attempt-7/report.en.md"), "missing English path");
  assert(summary.includes("English preview body."), "missing English preview");
  assert(summary.includes(".runs/compose-bi/attempt-7/report.zh.md"), "missing Chinese path");
  assert(summary.includes("Chinese preview body."), "missing Chinese preview");
  assert(summary.includes("## Evidence Grade Warnings"), "missing Evidence Grade section");
  return [
    "Bilingual summary includes job id, attempt number, report paths, previews, sources path, and Evidence Grade section.",
  ];
}

function runComposeEnOnly(): string[] {
  const summary = composeApprovalSummary({
    jobId: "compose-en",
    attemptNumber: 2,
    locales: ["en"],
    reportEnText: "# English only\n\nEnglish-only preview.\n",
    paths: {
      reportEn: ".runs/compose-en/attempt-2/report.en.md",
      sources: ".runs/compose-en/attempt-2/sources.json",
    },
  });

  assert(summary.includes("English-only preview."), "missing English preview");
  assert(summary.includes("Skipped: locales=en"), "missing en-only skip note");
  assert(!summary.includes("report.zh.md"), "en-only summary must not require Chinese path");
  return [
    "En-only summary includes English preview and a deterministic translation skip note without a Chinese path.",
  ];
}

function runEvidenceGradeWarnings(): string[] {
  const summary = composeApprovalSummary({
    jobId: "warnings",
    attemptNumber: 1,
    locales: ["en", "zh"],
    reportEnText:
      "# Report\n\n<!-- EVIDENCE_GRADE_WARN: first warning payload -->\nBody\n<!-- EVIDENCE_GRADE_WARN: second warning payload -->\n",
    reportZhText:
      "# Translation\n\n<!-- EVIDENCE_GRADE_WARN: zh-only warning should not surface -->\nBody\n",
    paths: {
      reportEn: ".runs/warnings/attempt-1/report.en.md",
      reportZh: ".runs/warnings/attempt-1/report.zh.md",
    },
  });

  assert(summary.includes("1. first warning payload"), "missing first payload");
  assert(summary.includes("2. second warning payload"), "missing second payload");
  assert(!summary.includes("zh-only warning should not surface"), "Chinese warning payload leaked");
  assert(!summary.includes("<!-- EVIDENCE_GRADE_WARN"), "warning wrapper leaked");
  return [
    "Two English Evidence Grade warning comments were surfaced as payloads without HTML wrappers; Chinese warning comments were ignored.",
  ];
}

function runSummaryLengthBound(): string[] {
  const warnings = Array.from(
    { length: 16 },
    (_, index) =>
      `<!-- EVIDENCE_GRADE_WARN: warning-${index}-${"x".repeat(300)} -->`,
  ).join("\n");
  const large = `# Large\n\n${"x".repeat(APPROVAL_SUMMARY_MAX_CHARS * 3)}\n${warnings}`;
  const summary = composeApprovalSummary({
    jobId: "large",
    attemptNumber: 1,
    locales: ["en", "zh"],
    reportEnText: large,
    reportZhText: large,
    paths: {
      reportEn: ".runs/large/attempt-1/report.en.md",
      reportZh: ".runs/large/attempt-1/report.zh.md",
    },
  });

  assert(summary.length <= APPROVAL_SUMMARY_MAX_CHARS, "summary exceeded max length");
  assert(summary.includes(TRUNCATION_MARKER), "summary missing truncation marker");
  return [
    `Oversized summary stayed within ${APPROVAL_SUMMARY_MAX_CHARS} chars and retained ${JSON.stringify(
      TRUNCATION_MARKER,
    )}.`,
  ];
}

async function runDbPersistenceEnOnlyExistingJob(dir: string): Promise<string[]> {
  const jobId = "db-persistence-en-only-existing-job";
  seedJobRow(dir, jobId, {
    status: "running",
    currentStage: Stage.RESEARCH,
  });

  const result = await runPreparedReportLoop({
    jobId,
    locales: ["en"],
    cwd: dir,
  });
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  const persisted = persistApprovalSummaryAfterLoop({
    cwd: dir,
    jobId,
    locales: ["en"],
    runDir: result.runDir,
    attemptNumber: result.attemptNumber,
  });
  assert(persisted.persisted, "expected persistence to update existing en-only row");

  const db = openDb(resolve(dir, ".data", "content.db"));
  try {
    const job = findJobById(db, jobId);
    assert(job !== null, "missing job after en-only persistence");
    assert(job.status === "awaiting_approval", `unexpected status ${job.status}`);
    assert(job.current_stage === Stage.EDIT_EN, `unexpected current_stage ${job.current_stage}`);
    assert(job.attempt_number === 1, `unexpected attempt_number ${job.attempt_number}`);
    assert(job.run_dir === `.runs/${jobId}`, `unexpected run_dir ${job.run_dir}`);
    assert(
      job.primary_report_path === `.runs/${jobId}/attempt-1/report.en.md`,
      `unexpected primary_report_path ${job.primary_report_path}`,
    );
    assert(
      job.translated_report_path === null,
      `unexpected translated_report_path ${job.translated_report_path}`,
    );
    assert(!existsSync(resolve(result.runDir, "report.zh.md")), "en-only run wrote report.zh.md");
    assert(
      (job.approval_summary ?? "").includes("Skipped: locales=en"),
      "approval_summary missing en-only skip note",
    );
    assert(
      !(job.approval_summary ?? "").includes("report.zh.md"),
      "en-only summary should not require report.zh.md",
    );
  } finally {
    db.close();
  }

  return [
    "Existing en-only DB row reached awaiting_approval with current_stage=edit_en, translated_report_path=null, and an en-only skip note.",
  ];
}

function runComposeDeterministic(): string[] {
  const opts = {
    jobId: "deterministic",
    attemptNumber: 3,
    locales: ["en", "zh"] as const,
    reportEnText: "# Same\n\nBody\n",
    reportZhText: "# Same zh\n\nBody\n",
    paths: {
      reportEn: ".runs/deterministic/attempt-3/report.en.md",
      reportZh: ".runs/deterministic/attempt-3/report.zh.md",
      sources: ".runs/deterministic/attempt-3/sources.json",
    },
  };
  const first = composeApprovalSummary(opts);
  const second = composeApprovalSummary(opts);
  assert(first === second, "identical inputs produced different summaries");
  return ["Identical inputs produced byte-identical approval summaries."];
}

async function runDbPersistenceExistingJob(dir: string): Promise<string[]> {
  const jobId = "db-persistence-existing-job";
  const oldUpdatedAt = unixNow() - 120;
  seedJobRow(dir, jobId, {
    updatedAt: oldUpdatedAt,
    status: "running",
    currentStage: Stage.RESEARCH,
    error: "stale error",
    notifiedAt: oldUpdatedAt + 1,
    lastNotifyError: "stale notify",
  });

  const result = await runPreparedReportLoop({
    jobId,
    locales: ["en", "zh"],
    cwd: dir,
  });
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  const attemptDir = resolve(dir, ".runs", jobId, "attempt-1");
  const enHashBefore = sha256File(resolve(attemptDir, "report.en.md"));
  const zhHashBefore = sha256File(resolve(attemptDir, "report.zh.md"));

  const persisted = persistApprovalSummaryAfterLoop({
    cwd: dir,
    jobId,
    locales: ["en", "zh"],
    runDir: result.runDir,
    attemptNumber: result.attemptNumber,
  });
  assert(persisted.persisted, "expected persistence to update existing row");

  const db = openDb(resolve(dir, ".data", "content.db"));
  try {
    const job = findJobById(db, jobId);
    assert(job !== null, "missing job after persistence");
    assert(job.status === "awaiting_approval", `unexpected status ${job.status}`);
    assert(job.current_stage === Stage.TRANSLATE_ZH, `unexpected current_stage ${job.current_stage}`);
    assert(job.attempt_number === 1, `unexpected attempt_number ${job.attempt_number}`);
    assert(job.run_dir === `.runs/${jobId}`, `unexpected run_dir ${job.run_dir}`);
    assert(
      job.primary_report_path === `.runs/${jobId}/attempt-1/report.en.md`,
      `unexpected primary_report_path ${job.primary_report_path}`,
    );
    assert(
      job.translated_report_path === `.runs/${jobId}/attempt-1/report.zh.md`,
      `unexpected translated_report_path ${job.translated_report_path}`,
    );
    assert(
      job.sources_path === `.runs/${jobId}/attempt-1/sources.json`,
      `unexpected sources_path ${job.sources_path}`,
    );
    assert((job.approval_summary ?? "").length > 0, "approval_summary remained empty");
    assert(job.updated_at > oldUpdatedAt, "updated_at did not advance");
    assert(job.error === null, "error was not cleared");
    assert(job.last_notify_error === null, "last_notify_error was not cleared");
    assert(job.notified_at === null, "notified_at was not cleared");
  } finally {
    db.close();
  }

  assert(enHashBefore === sha256File(resolve(attemptDir, "report.en.md")), "English report hash changed");
  assert(zhHashBefore === sha256File(resolve(attemptDir, "report.zh.md")), "Chinese report hash changed");
  return [
    "Existing DB row reached awaiting_approval with job-root run_dir, attempt-local paths, current attempt, and non-empty summary.",
    "updated_at advanced, error/notify fields cleared, and report artifact hashes did not change during persistence.",
  ];
}

async function runStageFailureNoApprovalPersistence(dir: string): Promise<string[]> {
  const jobId = "stage-failure-no-approval-persistence";
  seedJobRow(dir, jobId, {
    status: "running",
    currentStage: Stage.RESEARCH,
  });

  const result = await runPreparedReportLoop({
    jobId,
    locales: ["en", "zh"],
    cwd: dir,
    provider: createReportRunFakeProvider({ omitStages: [Stage.EDIT_EN] }),
  });
  assert(result.status === "stage_failed", `expected stage_failed, got ${result.status}`);

  const db = openDb(resolve(dir, ".data", "content.db"));
  try {
    const job = findJobById(db, jobId);
    assert(job !== null, "missing seeded job");
    assert(job.approval_summary === null, "approval_summary should remain null");
    assert(job.status !== "awaiting_approval", "failed stage must not set awaiting_approval");
    assert(job.primary_report_path === null, "primary_report_path should not advance");
    assert(job.translated_report_path === null, "translated_report_path should not advance");
  } finally {
    db.close();
  }

  return [
    "Forced fake-provider stage failure left approval_summary null, status non-terminal, and report paths unadvanced.",
  ];
}

async function runPersistenceFailureNonzero(dir: string): Promise<string[]> {
  const jobId = "persistence-failure-nonzero";
  seedJobRow(dir, jobId);
  const result = await runPreparedReportLoop({
    jobId,
    locales: ["en"],
    cwd: dir,
  });
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);

  unlinkSync(resolve(result.runDir, "report.en.md"));
  let failed = false;
  let message = "";
  try {
    persistApprovalSummaryAfterLoop({
      cwd: dir,
      jobId,
      locales: ["en"],
      runDir: result.runDir,
      attemptNumber: result.attemptNumber,
      dbOps: {
        updateJob(): RowsAffectedResult {
          throw new Error("synthetic update failure");
        },
      },
    });
  } catch (err) {
    failed = true;
    message = formatError(err);
  }

  assert(failed, "expected persistence branch to throw");
  assert(
    message.includes("approval-summary persistence failed") &&
      message.includes("required approval-summary artifact is missing"),
    `unexpected persistence error: ${message}`,
  );
  return [
    "After loop success, a seeded-row persistence attempt with a missing required artifact threw a readable approval-summary error.",
  ];
}

function runMissingJobNonfatal(dir: string): string[] {
  const result = runReportRunCli(dir, ["missing-job-nonfatal", "--locales=en"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(
    result.stderr.includes("approval-summary persistence skipped") &&
      result.stderr.includes("no jobs row found"),
    `expected skipped-persistence note, got ${result.stderr}`,
  );
  return [
    "No-row fake CLI run exited 0 and emitted an operator-readable skipped-persistence stderr note.",
  ];
}

async function runAlreadyCompleteIdempotent(dir: string): Promise<string[]> {
  const jobId = "already-complete-idempotent";
  seedJobRow(dir, jobId);
  const first = await runPreparedReportLoop({
    jobId,
    locales: ["en", "zh"],
    cwd: dir,
  });
  assert(first.status === "awaiting_approval", `expected awaiting_approval, got ${first.status}`);
  const attemptDir = resolve(dir, ".runs", jobId, "attempt-1");
  const beforeEntries = readdirSync(resolve(dir, ".runs", jobId)).join("\n");
  const beforeEnHash = sha256File(resolve(attemptDir, "report.en.md"));
  const beforeZhHash = sha256File(resolve(attemptDir, "report.zh.md"));
  let providerCalls = 0;
  const throwingProvider: LLMProvider = {
    name: "throwing-provider",
    async runPrompt(): Promise<string> {
      providerCalls++;
      throw new Error("provider must not be called for already-complete resume");
    },
  };

  const attempt = prepareReportRunAttempt({
    jobId,
    locales: ["en", "zh"],
    cwd: dir,
    resume: true,
  });
  if (!attempt.alreadyComplete) {
    await runReportLoop({
      jobId,
      locales: ["en", "zh"],
      provider: throwingProvider,
      cwd: dir,
      runDir: attempt.runDir,
      attemptNumber: attempt.attemptNumber,
      startStage: attempt.startStage,
      startedAt: attempt.startedAt,
      recoveryCleanup: attempt.recoveryCleanup,
    });
  }

  assert(attempt.alreadyComplete, "resume did not detect already-complete attempt");
  assert(providerCalls === 0, `provider was called ${providerCalls} times`);
  assert(!existsSync(resolve(dir, ".runs", jobId, "attempt-2")), "attempt-2 was created");
  assert(beforeEntries === readdirSync(resolve(dir, ".runs", jobId)).join("\n"), "attempt directory listing changed");
  assert(beforeEnHash === sha256File(resolve(attemptDir, "report.en.md")), "English report hash changed");
  assert(beforeZhHash === sha256File(resolve(attemptDir, "report.zh.md")), "Chinese report hash changed");
  return [
    "Already-complete resume created no new attempt, did not call the provider, and left report artifact hashes unchanged.",
  ];
}

function runNoPromptSurfaceStaticCheck(): string[] {
  const checkedFiles = [
    "src/pipeline/approval-summary.ts",
    "src/bin/report-run.ts",
  ];
  const forbidden: readonly ForbiddenPattern[] = [
    ...PROMPT_PRODUCING_SURFACE_PATTERNS,
    [/\.\.\/prompts/, "prompt import"],
    [/PROMPT|DELIMITER|BEGIN_|END_/, "prompt delimiter surface"],
  ];

  for (const file of checkedFiles) {
    assertNoForbiddenPatterns(
      readFileSync(resolve(repoRoot, file), "utf8"),
      forbidden,
      file,
    );
  }

  return [
    "Committed runtime TS files contain no buildPrompt, provider runPrompt call, prompt delimiter constants, or prompt-file references.",
  ];
}

async function runPreparedReportLoop(opts: {
  jobId: string;
  locales: readonly Locale[];
  cwd: string;
  provider?: ReturnType<typeof createReportRunFakeProvider>;
}): Promise<ReportLoopResult> {
  const attempt = prepareReportRunAttempt({
    jobId: opts.jobId,
    locales: opts.locales,
    cwd: opts.cwd,
  });
  recordRecoveryCleanupAudit({
    cwd: opts.cwd,
    jobId: opts.jobId,
    attemptNumber: attempt.attemptNumber,
    recoveryCleanup: attempt.recoveryCleanup,
  });
  return runReportLoop({
    jobId: opts.jobId,
    locales: opts.locales,
    provider: opts.provider ?? createReportRunFakeProvider(),
    cwd: opts.cwd,
    runDir: attempt.runDir,
    attemptNumber: attempt.attemptNumber,
    startStage: attempt.startStage,
    startedAt: attempt.startedAt,
    recoveryCleanup: attempt.recoveryCleanup,
  });
}

function runReportRunCli(
  cwd: string,
  args: string[],
): { exitCode: number | null; stdout: string; stderr: string } {
  const proc = Bun.spawnSync({
    cmd: ["bun", resolve(repoRoot, "src", "bin", "report-run.ts"), ...args],
    cwd,
    env: { ...process.env, LLM_PROVIDER: "fake" },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
  };
}

function seedJobRow(
  cwd: string,
  jobId: string,
  opts: {
    updatedAt?: number;
    status?: string;
    currentStage?: Stage;
    error?: string;
    notifiedAt?: number;
    lastNotifyError?: string;
  } = {},
): void {
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    if (findJobById(db, jobId)) return;
    const now = unixNow();
    insertJob(db, {
      id: jobId,
      week_key: `smoke-${jobId}`,
      topic: `Smoke ${jobId}`,
      status: opts.status ?? "queued",
      current_stage: opts.currentStage ?? Stage.RESEARCH,
      error: opts.error,
      notified_at: opts.notifiedAt,
      last_notify_error: opts.lastNotifyError,
      created_at: now - 240,
      updated_at: opts.updatedAt ?? now - 120,
    });
  } finally {
    db.close();
  }
}

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const lines = [
    "# approval-summary smoke evidence",
    "",
    `- Command: \`bun run approval-summary-smoke\``,
    `- Started: ${outcomes[0]?.startedAtIso ?? new Date().toISOString()}`,
    `- Finished: ${outcomes.at(-1)?.finishedAtIso ?? new Date().toISOString()}`,
    `- Scenario root: ${smokeRoot} (removed by finally-cleanup)`,
    "",
    "| Scenario | Result | Evidence |",
    "|---|---:|---|",
    ...outcomes.map(
      (outcome) =>
        `| ${outcome.name} | ${outcome.status} | ${outcome.details
          .map((detail) => detail.replaceAll("|", "\\|"))
          .join("<br>")} |`,
    ),
  ];
  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function removeEmptyDir(dir: string): void {
  try {
    rmdirSync(dir);
  } catch {
  }
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
