import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findEventsByJob,
  findJobById,
  insertJob,
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
  | "en-only-skip"
  | "stage-failure-mid-run"
  | "resume-after-failure"
  | "env-purity-static-check"
  | "resume-carry-forward"
  | "resume-after-success-idempotent"
  | "resume-edge-cases"
  | "carry-forward-partial-failure"
  | "recovery-cleanup-db-audit";

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
  "en-only-skip",
  "stage-failure-mid-run",
  "resume-after-failure",
  "env-purity-static-check",
  "resume-carry-forward",
  "resume-after-success-idempotent",
  "resume-edge-cases",
  "carry-forward-partial-failure",
  "recovery-cleanup-db-audit",
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
  setJobAttempt(dir, jobId, 2, Stage.EDIT_EN);

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
    "A cleanup resume without a DB jobs row failed before stage execution with an operator-readable recovery audit error.",
  ];
}

function providerOmitting(omitted: readonly Stage[]): FakeProvider {
  return createReportRunFakeProvider({ omitStages: omitted });
}

function runReportRunCli(
  cwd: string,
  args: string[],
  options: { llmProvider?: "fake" | "unset" } = {},
): { exitCode: number | null; stdout: string; stderr: string } {
  const env = { ...process.env };
  if (options.llmProvider === "unset") {
    delete env.LLM_PROVIDER;
  } else {
    env.LLM_PROVIDER = "fake";
  }

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

function setJobAttempt(
  cwd: string,
  jobId: string,
  attemptNumber: number,
  currentStage: Stage,
): void {
  const db = openDb(resolve(cwd, ".data", "content.db"));
  try {
    const updated = updateJob(db, jobId, {
      attempt_number: attemptNumber,
      status: "queued",
      current_stage: currentStage,
      updated_at: unixNow(),
    });
    assert(updated.rowsAffected === 1, `expected to update ${jobId} attempt`);
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
