import {
  createHash,
} from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findEventsByJob,
  findJobById,
  insertEvent,
  insertJob,
  LifecyclePersistenceError,
  openDb,
  recordRecoveryCleanup,
  recordResearchStageComplete,
  recordStageComplete,
  recordStageEnter,
  updateJob,
} from "../src/db.ts";
import { FakeProvider } from "../src/llm/fake.ts";
import {
  prepareReportRunAttempt,
  recordRecoveryCleanupAudit,
} from "../src/bin/report-run.ts";
import { createReportRunFakeProvider } from "../src/lib/report-run-fake-provider.ts";
import {
  type Locale,
  type RecoveryCleanup,
  runReportLoop,
  type ReportLoopResult,
  type RunState,
  type StageLifecycleHooks,
} from "../src/lib/report-loop.ts";
import { Stage } from "../src/pipeline/types.ts";

type ScenarioName =
  | "happy-path"
  | "approval-summary-continuity"
  | "lifecycle-happy-path-db-audit"
  | "lifecycle-failure-db-audit"
  | "default-llm-provider-when-unset"
  | "image-env-ignored-by-text-run"
  | "en-only-skip"
  | "stage-failure-mid-run"
  | "resume-after-failure"
  | "env-purity-static-check"
  | "resume-carry-forward"
  | "resume-after-success-idempotent"
  | "resume-edge-cases"
  | "carry-forward-partial-failure"
  | "recovery-cleanup-db-audit"
  | "resume-running-attempt-db-transition"
  | "resume-attempt-bootstrap-coherence"
  | "non-resume-incomplete-attempt-refusal"
  | "resume-prefixed-orphan-recovery"
  | "recovery-cleanup-atomicity-and-atom-edge"
  | "resume-race-or-stale-guard"
  | "recovery-cleanup-idempotence-and-divergence"
  | "resume-half-bootstrap-reconciliation"
  | "resume-state-consistency-classification"
  | "record-stage-enter-guard-preserved"
  | "report-run-fake-provider-research-match"
  | "report-run-source-context-staged"
  | "report-run-operator-source-copy"
  | "report-run-no-operator-source"
  | "report-run-source-file-count-bound"
  | "report-run-source-per-file-bound"
  | "report-run-source-total-bound"
  | "report-run-source-symlink-escape"
  | "report-run-source-carry-forward"
  | "report-run-boundary-static-check";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: ScenarioName[] = [
  "happy-path",
  "approval-summary-continuity",
  "lifecycle-happy-path-db-audit",
  "lifecycle-failure-db-audit",
  "default-llm-provider-when-unset",
  "image-env-ignored-by-text-run",
  "en-only-skip",
  "stage-failure-mid-run",
  "resume-after-failure",
  "env-purity-static-check",
  "resume-carry-forward",
  "resume-after-success-idempotent",
  "resume-edge-cases",
  "carry-forward-partial-failure",
  "recovery-cleanup-db-audit",
  "resume-running-attempt-db-transition",
  "resume-attempt-bootstrap-coherence",
  "non-resume-incomplete-attempt-refusal",
  "resume-prefixed-orphan-recovery",
  "recovery-cleanup-atomicity-and-atom-edge",
  "resume-race-or-stale-guard",
  "recovery-cleanup-idempotence-and-divergence",
  "resume-half-bootstrap-reconciliation",
  "resume-state-consistency-classification",
  "record-stage-enter-guard-preserved",
  "report-run-fake-provider-research-match",
  "report-run-source-context-staged",
  "report-run-operator-source-copy",
  "report-run-no-operator-source",
  "report-run-source-file-count-bound",
  "report-run-source-per-file-bound",
  "report-run-source-total-bound",
  "report-run-source-symlink-escape",
  "report-run-source-carry-forward",
  "report-run-boundary-static-check",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isoStamp = new Date().toISOString().replaceAll(":", "-");
const smokeRoot = resolve(repoRoot, ".runs", "report-run-smoke", isoStamp);
const docPath = resolve(repoRoot, "docs", "preflight", "report-run-smoke.md");

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
    removeEmptyDir(resolve(repoRoot, ".runs", "report-run-smoke"));
    removeEmptyDir(resolve(repoRoot, ".runs"));
  }

  for (const outcome of outcomes) {
    console.log(`${outcome.status} ${outcome.name}`);
    for (const detail of outcome.details) {
      console.log(`  - ${detail}`);
    }
  }

  return outcomes.every((outcome) => outcome.status === "PASS") ? 0 : 1;
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
    case "happy-path":
      return runHappyPath(dir);
    case "approval-summary-continuity":
      return runApprovalSummaryContinuity(dir);
    case "lifecycle-happy-path-db-audit":
      return runLifecycleHappyPathDbAudit(dir);
    case "lifecycle-failure-db-audit":
      return runLifecycleFailureDbAudit(dir);
    case "default-llm-provider-when-unset":
      return runDefaultLlmProviderWhenUnset(dir);
    case "image-env-ignored-by-text-run":
      return runImageEnvIgnoredByTextRun(dir);
    case "en-only-skip":
      return runEnOnlySkip(dir);
    case "stage-failure-mid-run":
      return runStageFailureMidRun(dir);
    case "resume-after-failure":
      return runResumeAfterFailure(dir);
    case "env-purity-static-check":
      return runEnvPurityStaticCheck();
    case "resume-carry-forward":
      return runResumeCarryForward(dir);
    case "resume-after-success-idempotent":
      return runResumeAfterSuccessIdempotent(dir);
    case "resume-edge-cases":
      return runResumeEdgeCases(dir);
    case "carry-forward-partial-failure":
      return runCarryForwardPartialFailure(dir);
    case "recovery-cleanup-db-audit":
      return runRecoveryCleanupDbAudit(dir);
    case "resume-running-attempt-db-transition":
      return runResumeRunningAttemptDbTransition(dir);
    case "resume-attempt-bootstrap-coherence":
      return runResumeAttemptBootstrapCoherence(dir);
    case "non-resume-incomplete-attempt-refusal":
      return runNonResumeIncompleteAttemptRefusal(dir);
    case "resume-prefixed-orphan-recovery":
      return runResumePrefixedOrphanRecovery(dir);
    case "recovery-cleanup-atomicity-and-atom-edge":
      return runRecoveryCleanupAtomicityAndAtomEdge(dir);
    case "resume-race-or-stale-guard":
      return runResumeRaceOrStaleGuard(dir);
    case "recovery-cleanup-idempotence-and-divergence":
      return runRecoveryCleanupIdempotenceAndDivergence(dir);
    case "resume-half-bootstrap-reconciliation":
      return runResumeHalfBootstrapReconciliation(dir);
    case "resume-state-consistency-classification":
      return runResumeStateConsistencyClassification(dir);
    case "record-stage-enter-guard-preserved":
      return runRecordStageEnterGuardPreserved();
    case "report-run-fake-provider-research-match":
      return runReportRunFakeProviderResearchMatch(dir);
    case "report-run-source-context-staged":
      return runReportRunSourceContextStaged(dir);
    case "report-run-operator-source-copy":
      return runReportRunOperatorSourceCopy(dir);
    case "report-run-no-operator-source":
      return runReportRunNoOperatorSource(dir);
    case "report-run-source-file-count-bound":
      return runReportRunSourceFileCountBound(dir);
    case "report-run-source-per-file-bound":
      return runReportRunSourcePerFileBound(dir);
    case "report-run-source-total-bound":
      return runReportRunSourceTotalBound(dir);
    case "report-run-source-symlink-escape":
      return runReportRunSourceSymlinkEscape(dir);
    case "report-run-source-carry-forward":
      return runReportRunSourceCarryForward(dir);
    case "report-run-boundary-static-check":
      return runReportRunBoundaryStaticCheck();
  }
}

async function runHappyPath(dir: string): Promise<string[]> {
  seedJobRow(dir, "happy");
  const result = runReportRunCli(dir, ["happy", "--locales=en,zh"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(
    result.stderr.includes("[report-run] LLM_PROVIDER=fake"),
    "expected LLM_PROVIDER visibility log",
  );
  const state = readState(dir, "happy", 1);
  assert(state.status === "awaiting_approval", `expected awaiting_approval, got ${state.status}`);
  assert(state.lastStage === Stage.TRANSLATE_ZH, `expected final translate_zh, got ${state.lastStage}`);
  assert(!existsSync(resolve(dir, ".runs", "happy", "attempt-2")), "attempt-2 must not exist");
  assertEditedReportMarker(dir, "happy", 1);
  assertTranslatedReportMarker(dir, "happy", 1);
  return [
    "CLI path exited 0 with the fake-provider visibility log.",
    "run-state.json reached awaiting_approval at translate_zh in attempt-1.",
    "report.en.md contains the fake edit marker after edit_en.",
    "report.zh.md is non-empty and contains the fake translation marker after translate_zh.",
  ];
}

async function runDefaultLlmProviderWhenUnset(dir: string): Promise<string[]> {
  seedJobRow(dir, "default-provider");
  const result = runReportRunCli(
    dir,
    ["default-provider", "--locales=en"],
    { llmProvider: "unset" },
  );
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  assert(
    result.stderr.includes("[report-run] LLM_PROVIDER=fake"),
    `expected unset LLM_PROVIDER to default to fake, got ${result.stderr}`,
  );
  const state = readState(dir, "default-provider", 1);
  assert(state.status === "awaiting_approval", `expected awaiting_approval, got ${state.status}`);
  assert(state.lastStage === Stage.EDIT_EN, `expected en-only terminal edit_en, got ${state.lastStage}`);
  return [
    "CLI path ran with LLM_PROVIDER absent from the child environment.",
    "runtime-config defaulted to FakeProvider and emitted the fake-provider visibility log.",
  ];
}

async function runImageEnvIgnoredByTextRun(dir: string): Promise<string[]> {
  seedJobRow(dir, "image-env-ignored");
  const result = runReportRunCli(
    dir,
    ["image-env-ignored", "--locales=en"],
    {
      llmProvider: "fake",
      extraEnv: {
        IMAGE_PROVIDER: "not-a-provider",
        VISION_JUDGE_PROVIDER: "not-a-judge",
        VISION_JUDGE_MODEL: "   ",
      },
    },
  );
  assert(result.exitCode === 0, `expected exit 0 with ignored image env, got ${result.exitCode}: ${result.stderr}`);
  assert(
    result.stderr.includes("[report-run] LLM_PROVIDER=fake"),
    `expected fake-provider visibility log, got ${result.stderr}`,
  );
  const state = readState(dir, "image-env-ignored", 1);
  assert(state.status === "awaiting_approval", `expected awaiting_approval, got ${state.status}`);
  assert(state.lastStage === Stage.EDIT_EN, `expected en-only terminal edit_en, got ${state.lastStage}`);
  return [
    "Text report:run ignored invalid image-only IMAGE_PROVIDER, VISION_JUDGE_PROVIDER, and VISION_JUDGE_MODEL env values.",
    "Existing text loadRuntimeConfig path still used LLM_PROVIDER=fake and completed an en-only run.",
  ];
}

async function runApprovalSummaryContinuity(dir: string): Promise<string[]> {
  const jobId = "approval-continuity";
  seedJobRow(dir, jobId);

  const first = runReportRunCli(dir, [jobId, "--locales=en,zh"]);
  assert(first.exitCode === 0, `expected initial exit 0, got ${first.exitCode}: ${first.stderr}`);

  const db = openDb(resolve(dir, ".data", "content.db"));
  let summaryAfterFirst: string;
  try {
    const job = findJobById(db, jobId);
    assert(job !== null, "missing seeded job after first run");
    assert(job.status === "awaiting_approval", `expected awaiting_approval, got ${job.status}`);
    assert(job.current_stage === Stage.TRANSLATE_ZH, `expected translate_zh, got ${job.current_stage}`);
    assert(job.run_dir === `.runs/${jobId}`, `unexpected run_dir ${job.run_dir}`);
    assert(
      job.primary_report_path === `.runs/${jobId}/attempt-1/report.en.md`,
      `unexpected primary_report_path ${job.primary_report_path}`,
    );
    assert(
      job.translated_report_path === `.runs/${jobId}/attempt-1/report.zh.md`,
      `unexpected translated_report_path ${job.translated_report_path}`,
    );
    assert((job.approval_summary ?? "").includes("Approval Summary"), "missing approval_summary");
    summaryAfterFirst = job.approval_summary ?? "";
  } finally {
    db.close();
  }

  const second = runReportRunCli(dir, [jobId, "--locales=en,zh", "--resume"]);
  assert(second.exitCode === 0, `expected resume exit 0, got ${second.exitCode}: ${second.stderr}`);
  assert(second.stderr.includes("already complete"), "expected already complete stderr");
  assert(!existsSync(resolve(dir, ".runs", jobId, "attempt-2")), "attempt-2 must not be created");

  const dbAfterResume = openDb(resolve(dir, ".data", "content.db"));
  try {
    const job = findJobById(dbAfterResume, jobId);
    assert(job !== null, "missing seeded job after resume");
    assert(job.approval_summary === summaryAfterFirst, "approval_summary changed during idempotent resume");
  } finally {
    dbAfterResume.close();
  }

  return [
    "Seeded CLI run persisted a non-empty approval_summary with job-root run_dir and attempt-local report paths.",
    "A completed resume stayed idempotent: no attempt-2 and the persisted approval_summary remained unchanged.",
  ];
}

async function runLifecycleHappyPathDbAudit(dir: string): Promise<string[]> {
  const jobId = "lifecycle-happy";
  seedJobRow(dir, jobId);
  const dbBefore = openDb(resolve(dir, ".data", "content.db"));
  try {
    const job = findJobById(dbBefore, jobId);
    assert(job?.as_of === null, "expected jobs.as_of to be null before report:run");
  } finally {
    dbBefore.close();
  }

  const result = runReportRunCli(dir, [jobId, "--locales=en,zh"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);

  const db = openDb(resolve(dir, ".data", "content.db"));
  try {
    const events = findEventsByJob(db, jobId).filter(
      (event) => event.type === "stage_enter" || event.type === "stage_complete",
    );
    const eventNames = events.map((event) => `${event.type}:${eventPayload(event.payload).stage}`);
    assert(
      eventNames.join(" > ") === [
        "stage_enter:research",
        "stage_complete:research",
        "stage_enter:draft_en",
        "stage_complete:draft_en",
        "stage_enter:edit_en",
        "stage_complete:edit_en",
        "stage_enter:translate_zh",
        "stage_complete:translate_zh",
      ].join(" > "),
      `unexpected lifecycle event order: ${eventNames.join(" > ")}`,
    );

    for (const event of events) {
      assert(event.attempt_number === 1, `unexpected attempt ${event.attempt_number}`);
      assertLifecyclePayloadShape(event.type, event.payload);
    }

    const researchComplete = events.find(
      (event) =>
        event.type === "stage_complete" &&
        eventPayload(event.payload).stage === Stage.RESEARCH,
    );
    assert(researchComplete !== undefined, "missing research stage_complete event");
    const job = findJobById(db, jobId);
    assert(job !== null, "missing job after lifecycle run");
    assert(
      job.as_of === researchComplete.created_at,
      `expected jobs.as_of=${researchComplete.created_at}, got ${job.as_of}`,
    );
    assert(job.status === "awaiting_approval", `expected awaiting_approval, got ${job.status}`);
  } finally {
    db.close();
  }

  return [
    "CLI happy path wrote ordered stage_enter/stage_complete pairs for all four stages.",
    "Lifecycle payloads used exact key sets and excluded raw fake-provider output/body/prompt fields.",
    "Research stage_complete and jobs.as_of shared the same durable completion timestamp.",
  ];
}

async function runLifecycleFailureDbAudit(dir: string): Promise<string[]> {
  const jobId = "lifecycle-failure";
  seedJobRow(dir, jobId);
  const db = openDb(resolve(dir, ".data", "content.db"));
  try {
    const result = await runPreparedReportLoop({
      jobId,
      locales: ["en", "zh"],
      provider: providerOmitting([Stage.EDIT_EN]),
      cwd: dir,
      lifecycle: createSmokeLifecycleHooks(db, dir),
    });
    assert(result.status === "stage_failed", `expected stage_failed, got ${result.status}`);

    const events = findEventsByJob(db, jobId).filter(
      (event) => event.type === "stage_enter" || event.type === "stage_complete",
    );
    const editEnter = events.filter(
      (event) =>
        event.type === "stage_enter" && eventPayload(event.payload).stage === Stage.EDIT_EN,
    );
    const editComplete = events.filter(
      (event) =>
        event.type === "stage_complete" && eventPayload(event.payload).stage === Stage.EDIT_EN,
    );
    assert(editEnter.length === 1, `expected one edit_en enter, got ${editEnter.length}`);
    assert(editComplete.length === 0, `expected zero edit_en complete, got ${editComplete.length}`);
  } finally {
    db.close();
  }

  return [
    "Loop-level lifecycle callbacks wrote stage_enter for the failed edit_en stage.",
    "The failed edit_en stage did not receive a stage_complete event.",
  ];
}

async function runEnOnlySkip(dir: string): Promise<string[]> {
  const result = await runPreparedReportLoop({
    jobId: "en-only",
    locales: ["en"],
    provider: providerOmitting([Stage.TRANSLATE_ZH]),
    cwd: dir,
  });
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  const state = readState(dir, "en-only", 1);
  assert(state.lastStage === Stage.EDIT_EN, `expected edit_en terminal, got ${state.lastStage}`);
  assertEditedReportMarker(dir, "en-only", 1);
  assert(
    !existsSync(resolve(dir, ".runs", "en-only", "attempt-1", "report.zh.md")),
    "report.zh.md must remain absent for en-only runs",
  );
  return [
    "FakeProvider omitted translate_zh, so an incorrect translation call would have failed.",
    "locales=['en'] terminated after edit_en.",
    "report.en.md contains the fake edit marker before awaiting approval.",
    "report.zh.md remained absent for the en-only run.",
  ];
}

async function runStageFailureMidRun(dir: string): Promise<string[]> {
  const result = await runPreparedReportLoop({
    jobId: "fail-mid",
    locales: ["en", "zh"],
    provider: providerOmitting([Stage.EDIT_EN]),
    cwd: dir,
  });
  assert(result.status === "stage_failed", `expected stage_failed, got ${result.status}`);
  assert(result.stage === Stage.EDIT_EN, `expected edit_en failure, got ${result.stage}`);
  assert(exitCodeForResult(result) === 2, "non-ok stage result must map to exit 2");
  const state = readState(dir, "fail-mid", 1);
  assert(state.status === "error", `expected run-state error, got ${state.status}`);
  assert(state.lastStage === Stage.EDIT_EN, `expected lastStage edit_en, got ${state.lastStage}`);
  return [
    "Missing edit_en canned prompt produced the same non-ok loop result the CLI maps to failure.",
    "The composition-root exit-code branch maps that non-ok stage result to exit 2.",
    "run-state.json recorded status=error and lastStage=edit_en.",
  ];
}

async function runResumeAfterFailure(dir: string): Promise<string[]> {
  seedJobRow(dir, "resume-failure");
  const attempt1 = resolve(dir, ".runs", "resume-failure", "attempt-1");
  mkdirSync(attempt1, { recursive: true });
  writeCarryForwardFiles(attempt1);
  writeState(attempt1, {
    schemaVersion: 1,
    jobId: "resume-failure",
    attemptNumber: 1,
    lastStage: Stage.EDIT_EN,
    status: "error",
    error: "synthetic edit failure",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });

  const result = await runPreparedReportLoop({
    jobId: "resume-failure",
    locales: ["en", "zh"],
    provider: providerOmitting([Stage.RESEARCH, Stage.DRAFT_EN]),
    cwd: dir,
    resume: true,
  });
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  assert(result.attemptNumber === 2, `expected attempt-2, got ${result.attemptNumber}`);
  const state = readState(dir, "resume-failure", 2);
  const cleanup = state.recoveryCleanup;
  assert(cleanup !== undefined, "expected recoveryCleanup");
  assert(cleanup.restartStage === Stage.EDIT_EN, "expected restartStage edit_en");
  assert(cleanup.fromAttempt === 1, "expected fromAttempt 1");
  assert(cleanup.copiedFromAttempt === 1, "expected copiedFromAttempt 1");
  assert(Array.isArray(cleanup.deletedFiles), "expected deletedFiles audit list");
  assert(state.lastStage === Stage.TRANSLATE_ZH, `expected final translate_zh, got ${state.lastStage}`);
  assert(existsSync(resolve(dir, ".runs", "resume-failure", "attempt-2", "report.en.md")), "report.en.md was not carried forward");
  return [
    "Resume from failed edit_en started at edit_en; missing research/draft prompts were never called.",
    "Atomic attempt-2 includes carry-forward files and recoveryCleanup audit data.",
  ];
}

async function runEnvPurityStaticCheck(): Promise<string[]> {
  const checkedFiles = [
    ...filesMatching(resolve(repoRoot, "src", "bin"), (file) => file.endsWith(".ts")),
    resolve(repoRoot, "src", "lib", "runtime-config.ts"),
    resolve(repoRoot, "src", "lib", "report-loop.ts"),
    ...filesMatching(resolve(repoRoot, "src", "pipeline"), (file) => file.endsWith(".ts")),
    ...filesMatching(resolve(repoRoot, "src", "llm"), (file) => file.endsWith(".ts")),
  ];

  const envPattern =
    /process\.env|Bun\.env|import\.meta\.env|Deno\.env|os\.userInfo|\/proc\/self\/environ|readFileSync.*\.env/;
  const argvPattern = /process\.argv/;
  const spawnPattern = /child_process|Bun\.spawn/;

  const envHits = grepFiles(checkedFiles, envPattern).filter(
    (hit) => hit.file !== resolve(repoRoot, "src", "lib", "runtime-config.ts"),
  );
  const argvHits = grepFiles(checkedFiles, argvPattern).filter(
    (hit) => hit.file !== resolve(repoRoot, "src", "bin", "report-run.ts"),
  );
  const spawnHits = grepFiles(
    [
      resolve(repoRoot, "src", "bin", "report-run.ts"),
      resolve(repoRoot, "src", "lib", "report-loop.ts"),
    ],
    spawnPattern,
  );

  assert(envHits.length === 0, `unexpected env hits: ${JSON.stringify(envHits)}`);
  assert(argvHits.length === 0, `unexpected process.argv hits: ${JSON.stringify(argvHits)}`);
  assert(spawnHits.length === 0, `unexpected spawn hits: ${JSON.stringify(spawnHits)}`);
  return [
    "Only runtime-config.ts reads process.env among the checked runtime files.",
    "process.argv appears only in src/bin/report-run.ts.",
    "src/bin/report-run.ts and src/lib/report-loop.ts contain no child_process or Bun.spawn references.",
  ];
}

async function runResumeCarryForward(dir: string): Promise<string[]> {
  seedJobRow(dir, "carry-forward");
  const attempt1 = resolve(dir, ".runs", "carry-forward", "attempt-1");
  mkdirSync(attempt1, { recursive: true });
  mkdirSync(resolve(attempt1, "research"), { recursive: true });
  writeFileSync(resolve(attempt1, "research", "brief.md"), "brief\n");
  writeFileSync(resolve(attempt1, "research", "notes.md"), "notes\n");
  writeFileSync(resolve(attempt1, "sources.json"), "[]\n");
  writeState(attempt1, {
    schemaVersion: 1,
    jobId: "carry-forward",
    attemptNumber: 1,
    lastStage: Stage.RESEARCH,
    status: "ok",
    startedAt: new Date().toISOString(),
  });

  const result = await runPreparedReportLoop({
    jobId: "carry-forward",
    locales: ["en", "zh"],
    provider: providerOmitting([Stage.RESEARCH]),
    cwd: dir,
    resume: true,
  });
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  const state = readState(dir, "carry-forward", 2);
  const cleanup = state.recoveryCleanup;
  assert(cleanup !== undefined, "expected recoveryCleanup");
  assert(cleanup.fromAttempt === 1, "expected fromAttempt 1");
  assert(cleanup.copiedFromAttempt === 1, "expected copiedFromAttempt 1");
  assert(cleanup.restartStage === Stage.DRAFT_EN, "expected restartStage draft_en");
  assert(
    cleanup.carryForward.join(",") === "research,sources.json",
    `unexpected carryForward ${cleanup.carryForward.join(",")}`,
  );
  assert(
    cleanup.deletedFiles.join(",") === "",
    `unexpected deletedFiles ${cleanup.deletedFiles.join(",")}`,
  );
  assert(existsSync(resolve(dir, ".runs", "carry-forward", "attempt-2", "research", "notes.md")), "research/ was not carried forward");
  assert(existsSync(resolve(dir, ".runs", "carry-forward", "attempt-2", "sources.json")), "sources.json was not carried forward");
  const recoveryBeforeIdempotentResume = JSON.stringify(cleanup);

  const second = await runPreparedReportLoop({
    jobId: "carry-forward",
    locales: ["en", "zh"],
    provider: providerOmitting([
      Stage.RESEARCH,
      Stage.DRAFT_EN,
      Stage.EDIT_EN,
      Stage.TRANSLATE_ZH,
    ]),
    cwd: dir,
    resume: true,
  });
  assert(second.status === "awaiting_approval", `expected idempotent awaiting_approval, got ${second.status}`);
  assert(second.attemptNumber === 2, `expected idempotent attempt-2, got ${second.attemptNumber}`);
  assert(second.alreadyComplete, "expected second resume to be alreadyComplete");
  assert(!existsSync(resolve(dir, ".runs", "carry-forward", "attempt-3")), "attempt-3 must not be created");
  assert(
    readdirSync(resolve(dir, ".runs", "carry-forward")).every(
      (entry) => !entry.includes(".bootstrap-"),
    ),
    "idempotent resume left a bootstrap directory",
  );
  const stateAfterIdempotentResume = readState(dir, "carry-forward", 2);
  assert(
    JSON.stringify(stateAfterIdempotentResume.recoveryCleanup) === recoveryBeforeIdempotentResume,
    "recoveryCleanup drifted after idempotent resume",
  );
  return [
    "Resume from ok research advanced to draft_en; missing research prompt was never called.",
    "research/ and sources.json were copied into attempt-2 with fromAttempt/copiedFromAttempt/deletedFiles recorded.",
    "A second resume was an already-complete no-op: no attempt-3, no bootstrap residue, no recoveryCleanup drift.",
  ];
}

async function runResumeAfterSuccessIdempotent(dir: string): Promise<string[]> {
  seedJobRow(dir, "idempotent");
  const first = runReportRunCli(dir, ["idempotent", "--locales=en,zh"]);
  assert(first.exitCode === 0, `expected initial exit 0, got ${first.exitCode}: ${first.stderr}`);
  const second = runReportRunCli(dir, ["idempotent", "--locales=en,zh", "--resume"]);
  assert(second.exitCode === 0, `expected resume exit 0, got ${second.exitCode}: ${second.stderr}`);
  assert(second.stderr.includes("already complete"), "expected already complete stderr");
  assert(!existsSync(resolve(dir, ".runs", "idempotent", "attempt-2")), "attempt-2 must not be created");
  return [
    "A completed job resumed as an idempotent no-op.",
    "The resume path emitted already complete and did not create attempt-2.",
  ];
}

async function runResumeEdgeCases(dir: string): Promise<string[]> {
  await expectResumeError(dir, "missing-root", "missing job directory");

  mkdirSync(resolve(dir, ".runs", "empty-root"), { recursive: true });
  await expectResumeError(dir, "empty-root", "empty job directory");

  mkdirSync(resolve(dir, ".runs", "no-state", "attempt-1"), { recursive: true });
  await expectResumeError(dir, "no-state", "no run-state.json");

  const corrupted = resolve(dir, ".runs", "corrupted", "attempt-1");
  mkdirSync(corrupted, { recursive: true });
  writeFileSync(resolve(corrupted, "run-state.json"), "{not json");
  await expectResumeError(dir, "corrupted", "unparseable run-state.json");

  const badSchema = resolve(dir, ".runs", "bad-schema", "attempt-1");
  mkdirSync(badSchema, { recursive: true });
  writeFileSync(
    resolve(badSchema, "run-state.json"),
    `${JSON.stringify({
      schemaVersion: 99,
      jobId: "bad-schema",
      attemptNumber: 1,
      lastStage: Stage.RESEARCH,
      status: "ok",
      startedAt: new Date().toISOString(),
    })}\n`,
  );
  await expectResumeError(dir, "bad-schema", "unsupported run-state schemaVersion");

  return [
    "Missing job directory, empty job directory, missing run-state, corrupted JSON, and schema mismatch all failed with exit-class precondition errors.",
  ];
}

async function runCarryForwardPartialFailure(dir: string): Promise<string[]> {
  seedJobRow(dir, "partial-failure");
  const attempt1 = resolve(dir, ".runs", "partial-failure", "attempt-1");
  mkdirSync(attempt1, { recursive: true });
  mkdirSync(resolve(attempt1, "research"), { recursive: true });
  writeFileSync(resolve(attempt1, "research", "brief.md"), "brief\n");
  writeFileSync(resolve(attempt1, "research", "notes.md"), "notes\n");
  writeFileSync(resolve(attempt1, "sources.json"), "[]\n");
  writeState(attempt1, {
    schemaVersion: 1,
    jobId: "partial-failure",
    attemptNumber: 1,
    lastStage: Stage.RESEARCH,
    status: "ok",
    startedAt: new Date().toISOString(),
  });

  let copyCalls = 0;
  let failed = false;
  try {
    await runPreparedReportLoop({
      jobId: "partial-failure",
      locales: ["en", "zh"],
      provider: providerOmitting([Stage.RESEARCH]),
      cwd: dir,
      resume: true,
      fsOps: {
        cpSync(from, to, options) {
          copyCalls++;
          if (copyCalls === 2) {
            throw new Error("synthetic cpSync failure");
          }
          cpSync(from, to, options);
        },
      },
    });
  } catch (err) {
    failed = formatError(err).includes("synthetic cpSync failure");
  }

  assert(failed, "expected injected cpSync failure");
  const jobRoot = resolve(dir, ".runs", "partial-failure");
  assert(!existsSync(resolve(jobRoot, "attempt-2")), "attempt-2 must not exist after failed bootstrap");
  assert(
    readdirSync(jobRoot).every((entry) => !entry.includes(".bootstrap-")),
    "bootstrap temp directory was not cleaned up",
  );

  const result = await runPreparedReportLoop({
    jobId: "partial-failure",
    locales: ["en", "zh"],
    provider: providerOmitting([Stage.RESEARCH]),
    cwd: dir,
    resume: true,
  });
  assert(result.status === "awaiting_approval", `expected second resume success, got ${result.status}`);
  assert(result.attemptNumber === 2, `expected second resume attempt-2, got ${result.attemptNumber}`);
  return [
    "Injected copy failure removed the bootstrap directory and left attempt-2 absent.",
    "A subsequent resume still selected attempt-1 as highest and published attempt-2 successfully.",
  ];
}

async function runRecoveryCleanupDbAudit(dir: string): Promise<string[]> {
  const jobId = "recovery-audit";
  seedJobRow(dir, jobId);
  writeFailedAttemptForRecovery(dir, jobId);
  const before = readJob(dir, jobId);
  assert(before?.attempt_number === 1, "resume smoke must not pre-set jobs.attempt_number=2");

  const result = runReportRunCli(dir, [jobId, "--locales=en,zh", "--resume"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);

  const state = readState(dir, jobId, 2);
  const cleanup = state.recoveryCleanup;
  assert(cleanup !== undefined, "expected recoveryCleanup in run-state.json");

  const db = openDb(resolve(dir, ".data", "content.db"));
  try {
    const events = findEventsByJob(db, jobId, "recovery_cleanup").filter(
      (event) => event.attempt_number === state.attemptNumber,
    );
    assert(events.length === 1, `expected one recovery_cleanup event, got ${events.length}`);
    assertRecoveryCleanupPayloadMatches(events[0].payload, cleanup);

    recordRecoveryCleanup(db, {
      jobId,
      attemptNumber: state.attemptNumber,
      recoveryCleanup: cleanup,
    });
    const afterDuplicate = findEventsByJob(db, jobId, "recovery_cleanup").filter(
      (event) => event.attempt_number === state.attemptNumber,
    );
    assert(
      afterDuplicate.length === 1,
      `expected duplicate recordRecoveryCleanup to leave one row, got ${afterDuplicate.length}`,
    );
  } finally {
    db.close();
  }

  const missingJobId = "recovery-audit-missing-job";
  writeFailedAttemptForRecovery(dir, missingJobId);
  const missing = runReportRunCli(dir, [missingJobId, "--locales=en,zh", "--resume"]);
  assert(missing.exitCode === 1, `expected missing job exit 1, got ${missing.exitCode}`);
  assert(
    missing.stderr.includes("recovery audit requires a DB jobs row") &&
      missing.stderr.includes(missingJobId),
    `expected missing DB jobs row recovery audit error, got ${missing.stderr}`,
  );
  const missingState = readState(dir, missingJobId, 2);
  assert(
    missingState.status === "running" && missingState.lastStage === Stage.EDIT_EN,
    `missing-job recovery audit failure must happen before stage execution, got ${missingState.status}/${missingState.lastStage}`,
  );

  return [
    "CLI resume with LLM_PROVIDER=fake wrote one recovery_cleanup event for attempt-2.",
    "The event payload matched run-state.json recoveryCleanup fields.",
    "A duplicate recordRecoveryCleanup call with the same job/attempt/payload left exactly one event row.",
    "The smoke no longer pre-set jobs.attempt_number=2 before invoking --resume.",
    "A cleanup resume without a DB jobs row failed before stage execution with an operator-readable recovery audit error.",
  ];
}

async function runResumeRunningAttemptDbTransition(dir: string): Promise<string[]> {
  const jobId = "resume-running-attempt-db-transition";
  seedRunningTranslateFixture(dir, jobId);

  const preJob = readJob(dir, jobId);
  assert(preJob?.attempt_number === 1, "pre-state jobs.attempt_number must be 1");
  assert(preJob.status === "running", `pre-state status must be running, got ${preJob.status}`);
  assert(preJob.current_stage === Stage.TRANSLATE_ZH, "pre-state current_stage mismatch");
  assert(existsSync(resolve(dir, ".runs", jobId, "attempt-1")), "missing attempt-1");
  assert(!existsSync(resolve(dir, ".runs", jobId, "attempt-2")), "attempt-2 must not pre-exist");
  assert(recoveryCleanupEvents(dir, jobId, 2).length === 0, "attempt-2 cleanup must not pre-exist");

  const result = runReportRunCli(dir, [jobId, "--locales=en,zh", "--resume"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);

  const state = readState(dir, jobId, 2);
  assert(state.status === "awaiting_approval", `expected awaiting_approval, got ${state.status}`);
  assert(state.recoveryCleanup?.restartStage === Stage.TRANSLATE_ZH, "bad restartStage");
  assert(existsSync(resolve(dir, ".runs", jobId, "attempt-2", "report.en.md")), "missing carried report.en.md");
  const postJob = readJob(dir, jobId);
  assert(postJob?.attempt_number === 2, `expected DB attempt 2, got ${postJob?.attempt_number}`);
  assert(postJob.status === "awaiting_approval", `expected DB awaiting_approval, got ${postJob.status}`);
  assert(postJob.current_stage === Stage.TRANSLATE_ZH, "post-state current_stage mismatch");
  const cleanupEvents = recoveryCleanupEvents(dir, jobId, 2);
  assert(cleanupEvents.length === 1, `expected one cleanup, got ${cleanupEvents.length}`);
  assert(findAttemptEvents(dir, jobId, 2, "stage_enter").length >= 1, "missing attempt-2 stage_enter");

  return [
    "The W20-shaped fixture started with filesystem attempt-1, jobs.attempt_number=1, and no attempt-2 recovery_cleanup.",
    "CLI --resume created attempt-2, atomically bootstrapped the DB, and stage_enter for attempt-2 succeeded.",
    "Post-state agreed across filesystem, events, and jobs: attempt_number=2, awaiting_approval, translate_zh.",
  ];
}

async function runResumeAttemptBootstrapCoherence(dir: string): Promise<string[]> {
  const jobId = "resume-attempt-bootstrap-coherence";
  seedRunningTranslateFixture(dir, jobId);

  const attempt = prepareReportRunAttempt({
    jobId,
    locales: ["en", "zh"],
    cwd: dir,
    resume: true,
  });
  assert(attempt.attemptNumber === 2, `expected attempt-2, got ${attempt.attemptNumber}`);
  assert(existsSync(attempt.runDir), "filesystem attempt-2 must exist before DB bootstrap");
  const beforeJob = readJob(dir, jobId);
  assert(beforeJob?.attempt_number === 1, "DB advanced before bootstrap");

  recordRecoveryCleanupAudit({
    cwd: dir,
    jobId,
    attemptNumber: attempt.attemptNumber,
    recoveryCleanup: attempt.recoveryCleanup,
  });

  const bootstrappedJob = readJob(dir, jobId);
  assert(bootstrappedJob?.attempt_number === 2, "bootstrap did not advance DB attempt");
  assert(bootstrappedJob.status === "running", "bootstrap did not set running status");
  assert(bootstrappedJob.current_stage === Stage.TRANSLATE_ZH, "bootstrap stage mismatch");
  assert(bootstrappedJob.run_dir === `.runs/${jobId}`, `unexpected run_dir ${bootstrappedJob.run_dir}`);
  assert(recoveryCleanupEvents(dir, jobId, 2).length === 1, "missing one cleanup event");
  assert(findAttemptEvents(dir, jobId, 2, "stage_enter").length === 0, "stage_enter ran before bootstrap proof");

  const db = openDb(resolve(dir, ".data", "content.db"));
  try {
    recordStageEnter(db, {
      jobId,
      attemptNumber: 2,
      stage: Stage.TRANSLATE_ZH,
      runDir: `.runs/${jobId}/attempt-2`,
    });
  } finally {
    db.close();
  }
  assert(findAttemptEvents(dir, jobId, 2, "stage_enter").length === 1, "strict stage_enter did not succeed after bootstrap");

  return [
    "Filesystem attempt-2 was prepared before the DB row moved from attempt 1.",
    "The bootstrap transaction established resume-attempt-bootstrap-coherence before any stage_enter event existed.",
    "The unchanged stage_enter guard succeeded only after jobs.attempt_number matched attempt-2.",
  ];
}

async function runNonResumeIncompleteAttemptRefusal(dir: string): Promise<string[]> {
  const jobId = "non-resume-incomplete-refusal";
  seedRunningTranslateFixture(dir, jobId);

  const preJob = readJob(dir, jobId);
  assert(preJob?.attempt_number === 1, "pre-state jobs.attempt_number must be 1");
  assert(preJob.status === "running", `pre-state status must be running, got ${preJob.status}`);
  assert(existsSync(resolve(dir, ".runs", jobId, "attempt-1")), "missing attempt-1");
  assert(!existsSync(resolve(dir, ".runs", jobId, "attempt-2")), "attempt-2 must not pre-exist");

  const result = runReportRunCli(dir, [jobId, "--locales=en,zh"]);
  assert(result.exitCode === 1, `expected non-resume refusal exit 1, got ${result.exitCode}: ${result.stderr}`);
  assert(result.stderr.includes("--resume"), `refusal did not instruct --resume: ${result.stderr}`);
  assert(
    result.stderr.includes("incomplete DB-backed attempt-1"),
    `refusal did not identify the incomplete DB attempt: ${result.stderr}`,
  );
  assert(!existsSync(resolve(dir, ".runs", jobId, "attempt-2")), "refusal published attempt-2");
  assert(
    allEvents(dir, jobId).filter((event) => event.attempt_number === 2).length === 0,
    "refusal wrote attempt-2 lifecycle events",
  );
  const postJob = readJob(dir, jobId);
  assert(postJob?.attempt_number === 1, "refusal changed jobs.attempt_number");
  assert(postJob.status === "running", "refusal changed jobs.status");
  assert(postJob.current_stage === Stage.TRANSLATE_ZH, "refusal changed jobs.current_stage");

  return [
    "A non-resume rerun against an incomplete DB-backed attempt failed before filesystem publication.",
    "The operator-facing error included --resume and identified the incomplete DB-backed attempt.",
    "The refusal left no attempt-2 directory, no attempt-2 lifecycle event, and kept jobs.attempt_number=1.",
  ];
}

async function runResumePrefixedOrphanRecovery(dir: string): Promise<string[]> {
  const jobId = "resume-prefixed-orphan-recovery";
  seedRunningResearchFixture(dir, jobId);
  const orphanAttempt = resolve(dir, ".runs", jobId, "attempt-2");
  mkdirSync(orphanAttempt, { recursive: true });
  writeState(orphanAttempt, {
    schemaVersion: 1,
    jobId,
    attemptNumber: 2,
    lastStage: Stage.RESEARCH,
    status: "running",
    startedAt: new Date().toISOString(),
  });

  const preJob = readJob(dir, jobId);
  assert(preJob?.attempt_number === 1, "orphan fixture must keep DB at attempt 1");
  assert(preJob.status === "running", "orphan fixture DB row must be running");
  assert(readState(dir, jobId, 2).recoveryCleanup === undefined, "orphan must lack recoveryCleanup");
  assert(allEvents(dir, jobId).filter((event) => event.attempt_number === 2).length === 0, "orphan fixture must lack attempt-2 events");

  const result = runReportRunCli(dir, [jobId, "--locales=en,zh", "--resume"]);
  assert(result.exitCode === 0, `expected orphan recovery success, got ${result.exitCode}: ${result.stderr}`);
  assert(!existsSync(resolve(dir, ".runs", jobId, "attempt-3")), "orphan recovery created attempt-3");

  const state = readState(dir, jobId, 2);
  assert(state.status === "awaiting_approval", `expected awaiting_approval, got ${state.status}`);
  assert(state.recoveryCleanup !== undefined, "recovered attempt-2 lacks recoveryCleanup");
  assert(state.recoveryCleanup.fromAttempt === 1, "recovered cleanup fromAttempt mismatch");
  assert(state.recoveryCleanup.restartStage === Stage.RESEARCH, "recovered cleanup restartStage mismatch");
  const postJob = readJob(dir, jobId);
  assert(postJob?.attempt_number === 2, `expected DB attempt 2, got ${postJob?.attempt_number}`);
  assert(postJob.status === "awaiting_approval", `expected DB awaiting_approval, got ${postJob.status}`);
  assert(recoveryCleanupEvents(dir, jobId, 2).length === 1, "missing recovered cleanup event");
  assert(findAttemptEvents(dir, jobId, 2, "stage_enter").length >= 1, "missing recovered attempt-2 stage_enter");

  return [
    "The fixture matched the pre-fix orphan class: running attempt-2 without recoveryCleanup, DB still attempt 1, and no attempt-2 events.",
    "CLI --resume discarded the unauthoritative directory and recovered as attempt-2 without creating attempt-3.",
    "Post-state was coherent across DB, run-state, recovery_cleanup, and stage_enter lifecycle evidence.",
  ];
}

async function runRecoveryCleanupAtomicityAndAtomEdge(dir: string): Promise<string[]> {
  const jobId = "recovery-cleanup-atomicity";
  writeRunningTranslateAttempt(dir, jobId);

  const attempt = prepareReportRunAttempt({
    jobId,
    locales: ["en", "zh"],
    cwd: dir,
    resume: true,
  });
  assert(attempt.attemptNumber === 2, "expected filesystem attempt-2 prep");
  assert(existsSync(resolve(dir, ".runs", jobId, "attempt-2")), "attempt-2 not prepared");
  assert(readJob(dir, jobId) === null, "missing-row fixture should not have a jobs row");

  let failed: unknown;
  try {
    recordRecoveryCleanupAudit({
      cwd: dir,
      jobId,
      attemptNumber: attempt.attemptNumber,
      recoveryCleanup: attempt.recoveryCleanup,
    });
  } catch (err) {
    failed = err;
  }
  assert(formatError(failed).includes("recovery audit requires a DB jobs row"), "expected typed recovery audit failure");
  assert(existsSync(resolve(dir, ".runs", jobId, "attempt-2")), "DB failure must not delete published attempt-2");
  assert(recoveryCleanupEvents(dir, jobId, 2).length === 0, "failed DB bootstrap left cleanup event");

  seedJobRow(dir, jobId);
  setJobState(dir, jobId, 1, "running", Stage.TRANSLATE_ZH);
  const retry = prepareReportRunAttempt({
    jobId,
    locales: ["en", "zh"],
    cwd: dir,
    resume: true,
  });
  assert(retry.attemptNumber === 2, `retry must reuse attempt-2, got attempt-${retry.attemptNumber}`);
  recordRecoveryCleanupAudit({
    cwd: dir,
    jobId,
    attemptNumber: retry.attemptNumber,
    recoveryCleanup: retry.recoveryCleanup,
  });
  assert(!existsSync(resolve(dir, ".runs", jobId, "attempt-3")), "retry created attempt-3 instead of reusing attempt-2");
  assert(readJob(dir, jobId)?.attempt_number === 2, "retry bootstrap did not advance DB");

  return [
    "Filesystem attempt-2 prep happened before DB bootstrap; without a jobs row, the DB remained unadvanced and event-free.",
    "A later retry reused the existing attempt-2 run-state/recoveryCleanup and completed the SQLite bootstrap.",
    "The normal implementation cannot leave the W20 split-brain through the DB transaction path.",
  ];
}

async function runResumeRaceOrStaleGuard(dir: string): Promise<string[]> {
  const jobId = "resume-race-or-stale-guard";
  seedRunningTranslateFixture(dir, jobId);
  const attempt = prepareReportRunAttempt({
    jobId,
    locales: ["en", "zh"],
    cwd: dir,
    resume: true,
  });
  setJobState(dir, jobId, 3, "running", Stage.TRANSLATE_ZH);

  let stale: unknown;
  try {
    recordRecoveryCleanupAudit({
      cwd: dir,
      jobId,
      attemptNumber: attempt.attemptNumber,
      recoveryCleanup: attempt.recoveryCleanup,
    });
  } catch (err) {
    stale = err;
  }
  assert(stale instanceof LifecyclePersistenceError, "expected lifecycle stale guard error");
  assert(formatError(stale).includes("resume bootstrap stale attempt guard missed"), "unexpected stale error");
  assert(recoveryCleanupEvents(dir, jobId, 2).length === 0, "rolled-back stale bootstrap left cleanup event");
  assert(findAttemptEvents(dir, jobId, 2, "stage_enter").length === 0, "stale resume left stage history");

  return [
    "A stale resume whose jobs row had already moved to another attempt failed with LIFECYCLE_PERSISTENCE_FAILED.",
    "The transaction rolled back recovery_cleanup insertion and produced no successful stage history for the losing attempt.",
  ];
}

async function runRecoveryCleanupIdempotenceAndDivergence(dir: string): Promise<string[]> {
  const matchingJobId = "recovery-cleanup-idempotent";
  seedRunningTranslateFixture(dir, matchingJobId);
  const matching = prepareReportRunAttempt({
    jobId: matchingJobId,
    locales: ["en", "zh"],
    cwd: dir,
    resume: true,
  });
  recordRecoveryCleanupAudit({
    cwd: dir,
    jobId: matchingJobId,
    attemptNumber: matching.attemptNumber,
    recoveryCleanup: matching.recoveryCleanup,
  });
  recordRecoveryCleanupAudit({
    cwd: dir,
    jobId: matchingJobId,
    attemptNumber: matching.attemptNumber,
    recoveryCleanup: matching.recoveryCleanup,
  });
  assert(recoveryCleanupEvents(dir, matchingJobId, 2).length === 1, "matching duplicate created extra cleanup");

  const divergentJobId = "recovery-cleanup-divergent";
  seedRunningTranslateFixture(dir, divergentJobId);
  const divergent = prepareReportRunAttempt({
    jobId: divergentJobId,
    locales: ["en", "zh"],
    cwd: dir,
    resume: true,
  });
  const db = openDb(resolve(dir, ".data", "content.db"));
  try {
    insertEvent(db, {
      job_id: divergentJobId,
      attempt_number: divergent.attemptNumber,
      type: "recovery_cleanup",
      payload: JSON.stringify({
        ...divergent.recoveryCleanup,
        deletedFiles: ["different.md"],
      }),
      created_at: unixNow(),
    });
  } finally {
    db.close();
  }

  let rejected: unknown;
  try {
    recordRecoveryCleanupAudit({
      cwd: dir,
      jobId: divergentJobId,
      attemptNumber: divergent.attemptNumber,
      recoveryCleanup: divergent.recoveryCleanup,
    });
  } catch (err) {
    rejected = err;
  }
  assert(rejected instanceof LifecyclePersistenceError, "expected divergent lifecycle rejection");
  assert(formatError(rejected).includes("divergent recovery_cleanup"), "unexpected divergent error");
  assert(readJob(dir, divergentJobId)?.attempt_number === 1, "divergent cleanup advanced jobs row");

  return [
    "A matching duplicate recovery_cleanup bootstrap was idempotent and kept exactly one row.",
    "A divergent pre-existing cleanup payload was rejected with LIFECYCLE_PERSISTENCE_FAILED before jobs.attempt_number advanced.",
  ];
}

async function runResumeHalfBootstrapReconciliation(dir: string): Promise<string[]> {
  const jobId = "resume-half-bootstrap-reconciliation";
  seedRunningTranslateFixture(dir, jobId);
  const prepared = prepareReportRunAttempt({
    jobId,
    locales: ["en", "zh"],
    cwd: dir,
    resume: true,
  });
  assert(prepared.recoveryCleanup !== undefined, "expected prepared cleanup");
  const db = openDb(resolve(dir, ".data", "content.db"));
  try {
    recordRecoveryCleanup(db, {
      jobId,
      attemptNumber: prepared.attemptNumber,
      recoveryCleanup: prepared.recoveryCleanup,
    });
  } finally {
    db.close();
  }
  assert(readJob(dir, jobId)?.attempt_number === 1, "fixture must keep DB at prior attempt");

  const result = runReportRunCli(dir, [jobId, "--locales=en,zh", "--resume"]);
  assert(result.exitCode === 0, `expected half-bootstrap resume success, got ${result.exitCode}: ${result.stderr}`);
  assert(!existsSync(resolve(dir, ".runs", jobId, "attempt-3")), "half-bootstrap retry created attempt-3");
  assert(readJob(dir, jobId)?.attempt_number === 2, "half-bootstrap retry did not reconcile jobs row");
  assert(recoveryCleanupEvents(dir, jobId, 2).length === 1, "half-bootstrap retry duplicated cleanup event");

  return [
    "The fixture approximated the Phase 4.35 half-bootstrap class: attempt-2 run-state plus cleanup event, jobs.attempt_number still 1.",
    "CLI --resume safely reused attempt-2, reconciled the jobs row, and did not create attempt-3.",
  ];
}

async function runResumeStateConsistencyClassification(dir: string): Promise<string[]> {
  const invalidAttempt = resolve(dir, ".runs", "bad-attempt", "attempt-1");
  mkdirSync(invalidAttempt, { recursive: true });
  writeState(invalidAttempt, {
    schemaVersion: 1,
    jobId: "bad-attempt",
    attemptNumber: 0,
    lastStage: Stage.RESEARCH,
    status: "running",
    startedAt: new Date().toISOString(),
  } as RunState);
  await expectResumeError(dir, "bad-attempt", "resume precondition failed: invalid attemptNumber");

  const badCleanup = resolve(dir, ".runs", "bad-cleanup", "attempt-2");
  mkdirSync(badCleanup, { recursive: true });
  writeCarryForwardFiles(badCleanup);
  writeState(badCleanup, {
    schemaVersion: 1,
    jobId: "bad-cleanup",
    attemptNumber: 2,
    lastStage: Stage.TRANSLATE_ZH,
    status: "running",
    startedAt: new Date().toISOString(),
    recoveryCleanup: {
      fromAttempt: 99,
      copiedFromAttempt: 1,
      deletedFiles: [],
      restartStage: Stage.TRANSLATE_ZH,
      carryForward: ["report.en.md"],
    },
  });
  await expectResumeError(dir, "bad-cleanup", "resume precondition failed: invalid recoveryCleanup");

  const mismatchJobId = "attempt-dir-mismatch";
  const mismatchAttempt = resolve(dir, ".runs", mismatchJobId, "attempt-2");
  mkdirSync(mismatchAttempt, { recursive: true });
  writeCarryForwardFiles(mismatchAttempt);
  writeState(mismatchAttempt, {
    schemaVersion: 1,
    jobId: mismatchJobId,
    attemptNumber: 3,
    lastStage: Stage.TRANSLATE_ZH,
    status: "running",
    startedAt: new Date().toISOString(),
    recoveryCleanup: {
      fromAttempt: 2,
      copiedFromAttempt: 2,
      deletedFiles: [],
      restartStage: Stage.TRANSLATE_ZH,
      carryForward: ["research", "sources.json", "report.en.md"],
    },
  });
  seedJobRow(dir, mismatchJobId);
  setJobState(dir, mismatchJobId, 2, "running", Stage.TRANSLATE_ZH);
  const mismatch = runReportRunCli(dir, [mismatchJobId, "--locales=en,zh", "--resume"]);
  assert(mismatch.exitCode === 1, `expected mismatch exit 1, got ${mismatch.exitCode}`);
  assert(
    mismatch.stderr.includes("run-state attemptNumber does not match attempt directory"),
    `expected attempt/directory mismatch error, got ${mismatch.stderr}`,
  );
  assert(readJob(dir, mismatchJobId)?.attempt_number === 2, "mismatch advanced jobs row");
  assert(recoveryCleanupEvents(dir, mismatchJobId, 3).length === 0, "mismatch wrote attempt-3 cleanup");
  assert(!existsSync(resolve(dir, ".runs", mismatchJobId, "attempt-3")), "mismatch created attempt-3");

  const staleJobId = "bad-job-row";
  seedRunningTranslateFixture(dir, staleJobId);
  const prepared = prepareReportRunAttempt({
    jobId: staleJobId,
    locales: ["en", "zh"],
    cwd: dir,
    resume: true,
  });
  setJobState(dir, staleJobId, 4, "running", Stage.TRANSLATE_ZH);
  let stale: unknown;
  try {
    recordRecoveryCleanupAudit({
      cwd: dir,
      jobId: staleJobId,
      attemptNumber: prepared.attemptNumber,
      recoveryCleanup: prepared.recoveryCleanup,
    });
  } catch (err) {
    stale = err;
  }
  assert(stale instanceof LifecyclePersistenceError, "expected stale job row lifecycle error");
  assert(!formatError(stale).includes("DB_READ_FAILED"), "stale job row was misclassified as DB_READ_FAILED");

  return [
    "Invalid attemptNumber, malformed recoveryCleanup, and attempt-directory/run-state mismatch failed as resume precondition errors.",
    "The attempt-directory/run-state mismatch left jobs.attempt_number and recovery_cleanup events unchanged.",
    "A structurally stale jobs row failed as LIFECYCLE_PERSISTENCE_FAILED, not as generic DB_READ_FAILED.",
  ];
}

async function runRecordStageEnterGuardPreserved(): Promise<string[]> {
  const source = readFileSync(resolve(repoRoot, "src", "db.ts"), "utf8");
  const recordStart = source.indexOf("export function recordStageEnter");
  const recordEnd = source.indexOf("export function recordStageComplete");
  const recordSource = source.slice(recordStart, recordEnd);
  assert(recordStart >= 0 && recordEnd > recordStart, "could not locate recordStageEnter");
  assert(recordSource.includes('"id = ? AND attempt_number = ?"'), "recordStageEnter lost attempt guard");
  const updateStart = recordSource.indexOf("const updated = updateJobWhere");
  const updateEnd = recordSource.indexOf("assertLifecycleGuard");
  const updatePatch = recordSource.slice(updateStart, updateEnd);
  assert(updateStart >= 0 && updateEnd > updateStart, "could not locate recordStageEnter update");
  assert(!updatePatch.includes("attempt_number:"), "recordStageEnter must not bump attempts");
  assert(!recordSource.includes("bootstrapResumeAttemptLifecycle"), "recordStageEnter must not call resume bootstrap");
  assert(source.includes("export function bootstrapResumeAttemptLifecycle"), "missing separate resume bootstrap helper");
  assert(source.includes("resume bootstrap guard missed"), "bootstrap helper lacks explicit lifecycle guard");

  return [
    "recordStageEnter still updates only where id and attempt_number match.",
    "Attempt-number bootstrapping lives in bootstrapResumeAttemptLifecycle, not in recordStageEnter.",
  ];
}

async function runReportRunFakeProviderResearchMatch(dir: string): Promise<string[]> {
  const jobId = "source-fake-match";
  seedJobRow(dir, jobId);
  writeOperatorSource(dir, jobId, "facts.md", "Operator fact for dynamic fake research prompt.\n");

  const result = runReportRunCli(dir, [jobId, "--locales=en"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  const brief = readFileSync(resolve(attemptDir(dir, jobId, 1), "research", "brief.md"), "utf8");
  assert(brief.includes("Synthetic fake-provider research brief"), "fake provider did not write research brief");
  assert(existsSync(resolve(attemptDir(dir, jobId, 1), "source-material", "manifest.json")), "missing staged manifest");

  return [
    "DB-backed CLI run staged source-material before research and still matched the fake provider by RESEARCH_PROMPT prefix.",
    "The fake provider wrote the same synthetic research/brief.md artifact for the dynamic prompt.",
  ];
}

async function runReportRunSourceContextStaged(dir: string): Promise<string[]> {
  const jobId = "source-context-staged";
  seedJobRow(dir, jobId);

  const result = runReportRunCli(dir, [jobId, "--locales=en"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);

  const sourceDir = resolve(attemptDir(dir, jobId, 1), "source-material");
  const context = readFileSync(resolve(sourceDir, "context.md"), "utf8");
  const manifest = readSourceManifest(dir, jobId, 1);
  assert(context.includes(`job_id: ${jobId}`), "context.md missing job id");
  assert(context.includes(`week_key: smoke-${jobId}`), "context.md missing week key");
  assert(context.includes(`topic: Smoke ${jobId}`), "context.md missing sanitized topic");
  assert(context.includes("locales: en"), "context.md missing locales");
  assert(context.includes("attempt_number: 1"), "context.md missing attempt number");
  assert(context.includes("operator_source_directory_present: false"), "context.md missing operator absence");
  assert(!context.includes("CLAUDE.md fixture"), "context.md leaked repo CLAUDE fixture");
  assert(!context.includes("PLAN.md fixture"), "context.md leaked repo PLAN fixture");
  assert(!context.includes("## Repo Context"), "context.md leaked repo context section");
  assert(!context.includes("APPROVE-WITH"), "context.md leaked review verdict language");
  assert(Array.isArray(manifest.entries), "manifest entries must be an array");
  assert(
    manifest.entries.some((entry) => entry.kind === "generated_job_context"),
    "manifest missing generated job context entry",
  );
  assert(
    !manifest.entries.some((entry) => entry.kind === "repo_context"),
    "manifest must not include repo_context entries",
  );
  assert(findAttemptEvents(dir, jobId, 1, "stage_enter").length >= 1, "missing lifecycle stage_enter");

  return [
    "DB-backed report:run created source-material/context.md and parseable manifest.json in attempt-1.",
    "Staged context recorded job id, week key, sanitized topic, locales, attempt number, and no operator source, while excluding repo context fixtures.",
    "Manifest listed generated job context and no repo_context entries before the run completed.",
  ];
}

async function runReportRunOperatorSourceCopy(dir: string): Promise<string[]> {
  const jobId = "source-copy";
  seedJobRow(dir, jobId);
  const sourcePath = writeOperatorSource(
    dir,
    jobId,
    "nested/facts.md",
    "Operator source fact remains unchanged.\n",
  );
  const before = readFileSync(sourcePath, "utf8");

  const result = runReportRunCli(dir, [jobId, "--locales=en"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  const copied = resolve(attemptDir(dir, jobId, 1), "source-material", "operator", "nested", "facts.md");
  assert(readFileSync(copied, "utf8") === before, "copied operator source content mismatch");
  assert(readFileSync(sourcePath, "utf8") === before, "operator source file was mutated");
  const manifest = readSourceManifest(dir, jobId, 1);
  assert(
    manifest.operatorSource.present === true,
    "manifest did not record operator source presence",
  );
  assert(
    manifest.entries.some(
      (entry) =>
        entry.kind === "operator_source" &&
        entry.localPath === "source-material/operator/nested/facts.md",
    ),
    "manifest missing copied operator source entry",
  );

  return [
    ".data/source-material/<job-id>/nested/facts.md was copied to source-material/operator/nested/facts.md.",
    "Manifest listed the copied operator source, and the original operator source file remained unchanged.",
  ];
}

async function runReportRunNoOperatorSource(dir: string): Promise<string[]> {
  const jobId = "source-no-operator";
  seedJobRow(dir, jobId);
  const result = runReportRunCli(dir, [jobId, "--locales=en"]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}: ${result.stderr}`);
  const manifest = readSourceManifest(dir, jobId, 1);
  const context = readFileSync(resolve(attemptDir(dir, jobId, 1), "source-material", "context.md"), "utf8");
  assert(manifest.operatorSource.present === false, "manifest did not record operator source absence");
  assert(context.includes("operator_source_directory_present: false"), "context did not record operator source absence");

  return [
    "Missing optional .data/source-material/<job-id>/ was recorded as absent.",
    "The DB-backed fake-provider run completed normally with generated job context only.",
  ];
}

async function runReportRunSourceFileCountBound(dir: string): Promise<string[]> {
  const jobId = "source-count-bound";
  seedJobRow(dir, jobId);
  for (let index = 0; index < 21; index++) {
    writeOperatorSource(dir, jobId, `file-${index}.md`, `file ${index}\n`);
  }

  return expectSourceStagingFailure(
    dir,
    jobId,
    "operator source file count exceeds 20",
    "More than 20 operator source files failed before provider invocation.",
  );
}

async function runReportRunSourcePerFileBound(dir: string): Promise<string[]> {
  const jobId = "source-per-file-bound";
  seedJobRow(dir, jobId);
  writeOperatorSource(dir, jobId, "too-large.md", "x".repeat(256 * 1024 + 1));

  return expectSourceStagingFailure(
    dir,
    jobId,
    "operator source file exceeds 262144 bytes",
    "A single operator source file over 256 KiB failed before provider invocation.",
  );
}

async function runReportRunSourceTotalBound(dir: string): Promise<string[]> {
  const jobId = "source-total-bound";
  seedJobRow(dir, jobId);
  for (let index = 0; index < 5; index++) {
    writeOperatorSource(dir, jobId, `chunk-${index}.md`, "x".repeat(220 * 1024));
  }

  return expectSourceStagingFailure(
    dir,
    jobId,
    "operator source total exceeds 1048576 bytes",
    "Aggregate operator source content over 1 MiB failed before provider invocation.",
  );
}

async function runReportRunSourceSymlinkEscape(dir: string): Promise<string[]> {
  const jobId = "source-symlink-escape";
  seedJobRow(dir, jobId);
  const sourceRoot = resolve(dir, ".data", "source-material", jobId);
  mkdirSync(sourceRoot, { recursive: true });
  const outside = resolve(dir, "outside-source.md");
  writeFileSync(outside, "outside\n");
  symlinkSync(outside, resolve(sourceRoot, "escape.md"));

  return expectSourceStagingFailure(
    dir,
    jobId,
    "operator source path must not be a symlink",
    "Symlink escape in operator source material failed before provider invocation.",
  );
}

async function runReportRunSourceCarryForward(dir: string): Promise<string[]> {
  const jobId = "source-carry-forward";
  seedJobRow(dir, jobId);
  const attempt1 = resolve(dir, ".runs", jobId, "attempt-1");
  mkdirSync(resolve(attempt1, "research"), { recursive: true });
  mkdirSync(resolve(attempt1, "source-material", "operator"), { recursive: true });
  writeFileSync(resolve(attempt1, "research", "brief.md"), "brief\n");
  writeFileSync(resolve(attempt1, "sources.json"), "[]\n");
  const contextAttempt1 = `# Research Source Material

## Job Context

- job_id: ${jobId}
- week_key: smoke-${jobId}
- topic: Smoke ${jobId}
- locales: en,zh
- attempt_number: 1

`;
  writeFileSync(resolve(attempt1, "source-material", "context.md"), contextAttempt1);
  writeFileSync(
    resolve(attempt1, "source-material", "manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: "research_source_material",
        jobId,
        weekKey: `smoke-${jobId}`,
        topic: `Smoke ${jobId}`,
        locales: ["en", "zh"],
        attemptNumber: 1,
        contextPath: "source-material/context.md",
        entries: [
          {
            id: "generated-job-context",
            kind: "generated_job_context",
            localPath: "source-material/context.md",
            byteCount: Buffer.byteLength(contextAttempt1, "utf8"),
            sha256: sha256Text(contextAttempt1),
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(resolve(attempt1, "source-material", "operator", "facts.md"), "carried source\n");
  writeState(attempt1, {
    schemaVersion: 1,
    jobId,
    attemptNumber: 1,
    lastStage: Stage.RESEARCH,
    status: "ok",
    startedAt: new Date().toISOString(),
  });

  const result = await runPreparedReportLoop({
    jobId,
    locales: ["en", "zh"],
    provider: providerOmitting([Stage.RESEARCH]),
    cwd: dir,
    resume: true,
  });
  assert(result.status === "awaiting_approval", `expected awaiting_approval, got ${result.status}`);
  const state = readState(dir, jobId, 2);
  assert(
    state.recoveryCleanup?.carryForward.join(",") === "research,sources.json,source-material",
    `unexpected carryForward ${state.recoveryCleanup?.carryForward.join(",")}`,
  );
  assert(
    readFileSync(resolve(dir, ".runs", jobId, "attempt-2", "source-material", "operator", "facts.md"), "utf8") === "carried source\n",
    "source-material was not carried forward",
  );
  const contextAttempt2 = readFileSync(
    resolve(dir, ".runs", jobId, "attempt-2", "source-material", "context.md"),
    "utf8",
  );
  const manifestAttempt2 = readSourceManifest(dir, jobId, 2);
  assert(contextAttempt2.includes("attempt_number: 2"), "carried context.md was not re-stamped");
  assert(!contextAttempt2.includes("attempt_number: 1"), "carried context.md kept stale attempt number");
  assert(manifestAttempt2.attemptNumber === 2, "carried manifest.json was not re-stamped");
  const contextEntry = manifestAttempt2.entries.find(
    (entry) => entry.id === "generated-job-context",
  );
  assert(contextEntry !== undefined, "carried manifest missing generated context entry");
  assert(
    contextEntry.byteCount === Buffer.byteLength(contextAttempt2, "utf8") &&
      contextEntry.sha256 === sha256Text(contextAttempt2),
    "carried manifest generated context hash was not refreshed",
  );

  return [
    "Resume from completed research carried source-material alongside research/ and sources.json.",
    "Carried source-material/context.md and manifest.json were re-stamped to attempt-2 with a refreshed generated-context hash.",
    "Missing research prompt was never called, preserving Slice 4.22 downstream resume behavior.",
  ];
}

async function runReportRunBoundaryStaticCheck(): Promise<string[]> {
  const allowed = new Set([
    "src/bin/report-run.ts",
    "scripts/report-run-smoke.ts",
    "docs/preflight/report-run-smoke.md",
  ]);
  // Slice 4.29 has a frozen, historical implementation range. The boundary
  // runs from the approval-label anchor to the Slice 4.29 implementation
  // commit (`rangeEnd`), NOT to live HEAD: once later slices (5, 6a, 6b, ...)
  // land, an `anchor..HEAD` diff would sweep in their files and falsely flag
  // them as out-of-scope. Pinning both ends keeps this a faithful, permanent
  // assertion over exactly what Slice 4.29 changed. The working-tree diff is
  // dropped for the same reason: post-merge there is no in-flight 4.29 work,
  // so it would only catch unrelated session dirt (e.g. regenerated smoke
  // evidence). The static source-inspection asserts below still read the
  // current report-run.ts as a live regression guard.
  const anchor = "84ce0cd784ccc1231cc9717cff6885967b55a16e";
  const rangeEnd = "ac6b0bfceb9f9cfb845e572f227ac16a7e24de61";
  const names = gitLines(["diff", "--name-only", `${anchor}..${rangeEnd}`])
    .filter((name) => name !== "README.md" && !name.startsWith("reports/"))
    .filter((name) => name.length > 0);
  assert(names.length > 0, "boundary check was vacuous: no implementation files detected");
  const unexpected = names.filter((name) => !allowed.has(name));
  assert(unexpected.length === 0, `unexpected implementation files: ${unexpected.join(",")}`);

  const reportRun = readFileSync(resolve(repoRoot, "src", "bin", "report-run.ts"), "utf8");
  assert(reportRun.includes("assertFreshAttemptAllowed"), "report-run lacks non-resume attempt precondition");
  assert(reportRun.includes("--resume"), "report-run refusal path lacks --resume operator guidance");
  assert(reportRun.includes("isUnauthoritativeFreshAttemptOrphan"), "report-run lacks orphan resume classifier");
  assert(reportRun.includes("findEventsByJob"), "orphan classifier does not inspect lifecycle events");
  assert(reportRun.includes("fsOps.rmSync(prior.dir"), "orphan recovery does not remove the unauthoritative attempt directory");
  for (const hardOut of [
    "package.json",
    "bun.lock",
    "bun.lockb",
    "src/db.ts",
    "src/lib/runtime-config.ts",
    "src/lib/report-loop.ts",
    "src/llm/",
    "src/prompts/",
    "src/migrations/",
    "src/telegram/",
    "src/bin/report-create.ts",
    "src/bin/report-show.ts",
    "src/bin/report-events.ts",
    "src/bin/report-publish-readme.ts",
    "src/bin/report-deliver-local.ts",
    "src/pipeline/draft-en.ts",
    "src/pipeline/edit-en.ts",
    "src/pipeline/translate-zh.ts",
    "AGENTS.md",
    "CLAUDE.md",
    "ROLE_POSITIONING.md",
    "docs/process/",
    ".omx/memory-edit/",
  ]) {
    assert(!names.some((name) => name === hardOut || name.startsWith(hardOut)), `hard-out touched: ${hardOut}`);
  }

  return [
    `Frozen Slice 4.29 implementation-range diff inspected (${anchor}..${rangeEnd}, excluding pre-existing README/reports runtime evidence): ${names.join(", ")}.`,
    "Only Slice 4.29 allowed implementation/evidence files were present in the boundary diff.",
    "Static source inspection found the non-resume refusal, --resume guidance, lifecycle-event orphan classifier, and orphan directory cleanup path.",
    "Static hard-out scan found no package/schema/runtime/provider/downstream prompt/publish/Telegram/governance surfaces in the implementation range.",
  ];
}

function providerOmitting(omitted: readonly Stage[]): FakeProvider {
  return createReportRunFakeProvider({ omitStages: omitted });
}

function runReportRunCli(
  cwd: string,
  args: string[],
  options: { llmProvider?: "fake" | "unset"; extraEnv?: Record<string, string> } = {},
): { exitCode: number | null; stdout: string; stderr: string } {
  const env = { ...process.env };
  if (options.llmProvider === "unset") {
    delete env.LLM_PROVIDER;
  } else {
    env.LLM_PROVIDER = "fake";
  }
  Object.assign(env, options.extraEnv ?? {});

  const proc = Bun.spawnSync({
    cmd: ["bun", resolve(repoRoot, "src", "bin", "report-run.ts"), ...args],
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
  };
}

async function runPreparedReportLoop(opts: {
  jobId: string;
  locales: readonly Locale[];
  provider: FakeProvider;
  cwd: string;
  resume?: boolean;
  fsOps?: Parameters<typeof prepareReportRunAttempt>[0]["fsOps"];
  lifecycle?: StageLifecycleHooks;
}): Promise<ReportLoopResult> {
  const attempt = prepareReportRunAttempt({
    jobId: opts.jobId,
    locales: opts.locales,
    cwd: opts.cwd,
    resume: opts.resume,
    fsOps: opts.fsOps,
  });
  if (attempt.alreadyComplete) {
    return {
      status: "awaiting_approval",
      runDir: attempt.runDir,
      attemptNumber: attempt.attemptNumber,
      alreadyComplete: true,
    };
  }
  recordRecoveryCleanupAudit({
    cwd: opts.cwd,
    jobId: opts.jobId,
    attemptNumber: attempt.attemptNumber,
    recoveryCleanup: attempt.recoveryCleanup,
  });

  return runReportLoop({
    jobId: opts.jobId,
    locales: opts.locales,
    provider: opts.provider,
    cwd: opts.cwd,
    runDir: attempt.runDir,
    attemptNumber: attempt.attemptNumber,
    startStage: attempt.startStage,
    startedAt: attempt.startedAt,
    recoveryCleanup: attempt.recoveryCleanup,
    lifecycle: opts.lifecycle,
  });
}

function createSmokeLifecycleHooks(db: ReturnType<typeof openDb>, cwd: string): StageLifecycleHooks {
  return {
    onStageEnter(event) {
      recordStageEnter(db, {
        jobId: event.jobId,
        attemptNumber: event.attemptNumber,
        stage: event.stage,
        runDir: displayPath(cwd, event.runDir),
      });
    },
    onStageComplete(event) {
      const params = {
        jobId: event.jobId,
        attemptNumber: event.attemptNumber,
        stage: event.stage,
        runDir: displayPath(cwd, event.runDir),
      };
      if (event.stage === Stage.RESEARCH) {
        recordResearchStageComplete(db, params);
      } else {
        recordStageComplete(db, params);
      }
    },
  };
}

function readState(cwd: string, jobId: string, attemptNumber: number): RunState {
  return JSON.parse(
    readFileSync(
      resolve(cwd, ".runs", jobId, `attempt-${attemptNumber}`, "run-state.json"),
      "utf8",
    ),
  ) as RunState;
}

function writeState(attemptDir: string, state: RunState): void {
  writeFileSync(resolve(attemptDir, "run-state.json"), `${JSON.stringify(state, null, 2)}\n`);
}

function writeCarryForwardFiles(attemptDir: string): void {
  mkdirSync(resolve(attemptDir, "research"), { recursive: true });
  writeFileSync(resolve(attemptDir, "research", "brief.md"), "brief\n");
  writeFileSync(resolve(attemptDir, "research", "notes.md"), "notes\n");
  writeFileSync(resolve(attemptDir, "sources.json"), "[]\n");
  writeFileSync(resolve(attemptDir, "report.en.md"), "English report\n");
}

function writeRepoContextFixture(cwd: string): void {
  writeFileSync(
    resolve(cwd, "CLAUDE.md"),
    "# CLAUDE.md fixture\n\nCLAUDE.md fixture content design context for report-run smoke.\n",
  );
  writeFileSync(
    resolve(cwd, "PLAN.md"),
    "# PLAN.md fixture\n\nPLAN.md fixture roadmap context for report-run smoke.\n",
  );
}

function attemptDir(cwd: string, jobId: string, attemptNumber: number): string {
  return resolve(cwd, ".runs", jobId, `attempt-${attemptNumber}`);
}

function writeOperatorSource(
  cwd: string,
  jobId: string,
  relPath: string,
  content: string,
): string {
  const target = resolve(cwd, ".data", "source-material", jobId, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

function readSourceManifest(
  cwd: string,
  jobId: string,
  attemptNumber: number,
): {
  attemptNumber?: number;
  operatorSource: { present: boolean; entries: string[] };
  entries: Array<Record<string, string | number | boolean>>;
} {
  return JSON.parse(
    readFileSync(
      resolve(attemptDir(cwd, jobId, attemptNumber), "source-material", "manifest.json"),
      "utf8",
    ),
  );
}

function sha256Text(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function expectSourceStagingFailure(
  cwd: string,
  jobId: string,
  expected: string,
  detail: string,
): string[] {
  const before = readJob(cwd, jobId);
  const beforeEventCount = allEvents(cwd, jobId).length;
  const result = runReportRunCli(cwd, [jobId, "--locales=en"]);
  assert(result.exitCode === 1, `expected source-staging exit 1, got ${result.exitCode}: ${result.stderr}`);
  assert(
    result.stderr.includes("source-staging precondition failed") &&
      result.stderr.includes(expected),
    `expected source-staging error ${JSON.stringify(expected)}, got ${result.stderr}`,
  );
  assert(!existsSync(resolve(attemptDir(cwd, jobId, 1), "research", "brief.md")), "provider was invoked despite source-staging failure");
  assert(findAttemptEvents(cwd, jobId, 1, "stage_enter").length === 0, "source-staging failure wrote stage_enter event");
  assert(findAttemptEvents(cwd, jobId, 1, "stage_complete").length === 0, "source-staging failure wrote stage_complete event");
  assert(allEvents(cwd, jobId).length === beforeEventCount, "source-staging failure wrote DB events");
  const after = readJob(cwd, jobId);
  assert(before !== null && after !== null, "missing DB job around source-staging failure");
  assert(after.status === before.status, "source-staging failure changed job status");
  assert(after.current_stage === before.current_stage, "source-staging failure changed current stage");
  assert(after.attempt_number === before.attempt_number, "source-staging failure changed attempt number");
  return [
    detail,
    "Failure happened before fake-provider research artifacts, lifecycle stage_enter, or stage_complete.",
    "The DB job status/current_stage/attempt_number remained unchanged.",
  ];
}

function assertEditedReportMarker(
  cwd: string,
  jobId: string,
  attemptNumber: number,
): void {
  const report = readFileSync(
    resolve(cwd, ".runs", jobId, `attempt-${attemptNumber}`, "report.en.md"),
    "utf8",
  );
  assert(
    report.includes("Synthetic fake-provider edited English report"),
    "expected report.en.md to contain the fake edit marker",
  );
}

function assertTranslatedReportMarker(
  cwd: string,
  jobId: string,
  attemptNumber: number,
): void {
  const report = readFileSync(
    resolve(cwd, ".runs", jobId, `attempt-${attemptNumber}`, "report.zh.md"),
    "utf8",
  );
  assert(report.trim().length > 0, "expected report.zh.md to be non-empty");
  assert(
    report.includes("Synthetic fake-provider Chinese translation"),
    "expected report.zh.md to contain the fake translation marker",
  );
}

function seedJobRow(cwd: string, jobId: string): void {
  writeRepoContextFixture(cwd);
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    if (findJobById(db, jobId)) return;
    const now = unixNow();
    insertJob(db, {
      id: jobId,
      week_key: `smoke-${jobId}`,
      topic: `Smoke ${jobId}`,
      status: "queued",
      current_stage: Stage.RESEARCH,
      created_at: now,
      updated_at: now,
    });
  } finally {
    db.close();
  }
}

function seedRunningTranslateFixture(cwd: string, jobId: string): void {
  seedJobRow(cwd, jobId);
  setJobState(cwd, jobId, 1, "running", Stage.TRANSLATE_ZH);
  writeRunningTranslateAttempt(cwd, jobId);
}

function seedRunningResearchFixture(cwd: string, jobId: string): void {
  seedJobRow(cwd, jobId);
  setJobState(cwd, jobId, 1, "running", Stage.RESEARCH);
  const attempt1 = resolve(cwd, ".runs", jobId, "attempt-1");
  mkdirSync(attempt1, { recursive: true });
  writeState(attempt1, {
    schemaVersion: 1,
    jobId,
    attemptNumber: 1,
    lastStage: Stage.RESEARCH,
    status: "running",
    startedAt: new Date().toISOString(),
  });
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    recordStageEnter(db, {
      jobId,
      attemptNumber: 1,
      stage: Stage.RESEARCH,
      runDir: `.runs/${jobId}/attempt-1`,
    });
  } finally {
    db.close();
  }
}

function writeRunningTranslateAttempt(cwd: string, jobId: string): void {
  const attempt1 = resolve(cwd, ".runs", jobId, "attempt-1");
  mkdirSync(attempt1, { recursive: true });
  writeCarryForwardFiles(attempt1);
  writeState(attempt1, {
    schemaVersion: 1,
    jobId,
    attemptNumber: 1,
    lastStage: Stage.TRANSLATE_ZH,
    status: "running",
    startedAt: new Date().toISOString(),
  });
}

function readJob(cwd: string, jobId: string) {
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    return findJobById(db, jobId);
  } finally {
    db.close();
  }
}

function setJobAttempt(
  cwd: string,
  jobId: string,
  attemptNumber: number,
  currentStage: Stage,
): void {
  setJobState(cwd, jobId, attemptNumber, "queued", currentStage);
}

function setJobState(
  cwd: string,
  jobId: string,
  attemptNumber: number,
  status: string,
  currentStage: Stage,
): void {
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    const updated = updateJob(db, jobId, {
      attempt_number: attemptNumber,
      status,
      current_stage: currentStage,
      updated_at: unixNow(),
    });
    assert(updated.rowsAffected === 1, `expected to update ${jobId} attempt`);
  } finally {
    db.close();
  }
}

function recoveryCleanupEvents(cwd: string, jobId: string, attemptNumber: number) {
  return findAttemptEvents(cwd, jobId, attemptNumber, "recovery_cleanup");
}

function findAttemptEvents(
  cwd: string,
  jobId: string,
  attemptNumber: number,
  type: string,
) {
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    return findEventsByJob(db, jobId, type).filter(
      (event) => event.attempt_number === attemptNumber,
    );
  } finally {
    db.close();
  }
}

function allEvents(cwd: string, jobId: string) {
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    return findEventsByJob(db, jobId);
  } finally {
    db.close();
  }
}

function eventPayload(payload: string | null): Record<string, unknown> {
  assert(payload !== null, "expected lifecycle payload");
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  return parsed;
}

function assertLifecyclePayloadShape(type: string, payload: string | null): void {
  const parsed = eventPayload(payload);
  const keys = Object.keys(parsed).sort();
  if (type === "stage_enter") {
    assert(
      keys.join(",") === "run_dir,stage",
      `unexpected stage_enter keys ${keys.join(",")}`,
    );
  } else if (type === "stage_complete") {
    assert(
      keys.join(",") === "run_dir,stage,status",
      `unexpected stage_complete keys ${keys.join(",")}`,
    );
    assert(parsed.status === "ok", `expected status ok, got ${String(parsed.status)}`);
  } else {
    throw new Error(`unexpected lifecycle event type ${type}`);
  }

  assert(typeof parsed.stage === "string" && parsed.stage.length > 0, "missing stage");
  assert(typeof parsed.run_dir === "string" && parsed.run_dir.startsWith(".runs/"), "bad run_dir");
  const payloadText = JSON.stringify(parsed);
  for (const forbidden of [
    "content",
    "markdown",
    "body",
    "response",
    "artifact_text",
    "prompt",
    "output",
    "Synthetic fake-provider",
  ]) {
    assert(!payloadText.includes(forbidden), `payload leaked forbidden token ${forbidden}`);
  }
}

function displayPath(cwd: string, absolutePath: string): string {
  const relative = path.relative(cwd, absolutePath);
  if (relative.startsWith(".")) return relative.replaceAll(path.sep, "/");
  return `.${path.sep}${relative}`.replaceAll(path.sep, "/");
}

function writeFailedAttemptForRecovery(cwd: string, jobId: string): void {
  const attempt1 = resolve(cwd, ".runs", jobId, "attempt-1");
  mkdirSync(attempt1, { recursive: true });
  writeCarryForwardFiles(attempt1);
  writeState(attempt1, {
    schemaVersion: 1,
    jobId,
    attemptNumber: 1,
    lastStage: Stage.EDIT_EN,
    status: "error",
    error: "synthetic edit failure",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
}

function assertRecoveryCleanupPayloadMatches(
  payload: string | null,
  cleanup: RecoveryCleanup,
): void {
  assert(payload !== null, "expected recovery_cleanup payload");
  const parsed = JSON.parse(payload) as RecoveryCleanup;
  assert(parsed.fromAttempt === cleanup.fromAttempt, "payload fromAttempt mismatch");
  assert(
    parsed.copiedFromAttempt === cleanup.copiedFromAttempt,
    "payload copiedFromAttempt mismatch",
  );
  assert(
    JSON.stringify(parsed.deletedFiles) === JSON.stringify(cleanup.deletedFiles),
    "payload deletedFiles mismatch",
  );
  assert(parsed.restartStage === cleanup.restartStage, "payload restartStage mismatch");
  assert(
    JSON.stringify(parsed.carryForward) === JSON.stringify(cleanup.carryForward),
    "payload carryForward mismatch",
  );
}

async function expectResumeError(
  cwd: string,
  jobId: string,
  expected: string,
): Promise<void> {
  const result = runReportRunCli(cwd, [jobId, "--resume"]);
  assert(result.exitCode === 1, `expected exit 1, got ${result.exitCode}`);
  const logIndex = result.stderr.indexOf("[report-run] LLM_PROVIDER=fake");
  const errorIndex = result.stderr.indexOf(expected);
  assert(logIndex !== -1, `expected LLM_PROVIDER visibility log, got ${result.stderr}`);
  assert(
    logIndex < errorIndex,
    `expected visibility log before resume precondition error, got ${result.stderr}`,
  );
  assert(
    result.stderr.includes(expected),
    `expected stderr ${JSON.stringify(expected)}, got ${result.stderr}`,
  );
}

function exitCodeForResult(result: Awaited<ReturnType<typeof runReportLoop>>): number {
  return result.status === "stage_failed" ? 2 : 0;
}

function filesMatching(root: string, predicate: (file: string) => boolean): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...filesMatching(full, predicate));
    } else if (entry.isFile() && predicate(full)) {
      files.push(full);
    }
  }
  return files;
}

function grepFiles(
  files: readonly string[],
  pattern: RegExp,
): Array<{ file: string; line: number; text: string }> {
  const hits: Array<{ file: string; line: number; text: string }> = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, index) => {
      if (pattern.test(text)) {
        hits.push({ file, line: index + 1, text });
      }
    });
  }
  return hits;
}

function gitLines(args: readonly string[]): string[] {
  const proc = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = new TextDecoder().decode(proc.stderr).trim();
  assert(proc.exitCode === 0, `git ${args.join(" ")} failed: ${stderr}`);
  return new TextDecoder()
    .decode(proc.stdout)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const lines = [
    "# report-run smoke evidence",
    "",
    `- Command: \`bun run report-run-smoke\``,
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
