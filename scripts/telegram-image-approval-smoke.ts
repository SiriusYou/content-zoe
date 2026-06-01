import {
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findEventsByJob,
  findJobById,
  insertJob,
  openDb,
  type DbClient,
  type Job,
} from "../src/db.ts";
import {
  createTelegramHttpTransport,
  createTelegramSender,
  type TelegramTransport,
} from "../src/telegram/bot.ts";
import {
  formatApprovalNotification,
  notifyPendingApprovals,
  type ApprovalNotification,
} from "../src/telegram/notifier.ts";
import {
  passingVerdict,
  validImageSpec,
} from "../src/lib/image-run-fake-provider.ts";
import type { ImageSpec } from "../src/pipeline/image/spec.ts";
import type { JudgeVerdict } from "../src/pipeline/image/verdict.ts";

type ScenarioName =
  | "image-send-photo-success"
  | "text-regression-send-message"
  | "send-photo-unavailable-fallback"
  | "oversize-photo-send-document"
  | "unsafe-run-dir-zero-send"
  | "unsafe-image-zero-send"
  | "bad-metadata-zero-send"
  | "caption-truncation-preserves-commands"
  | "bot-transport-send-photo-static";

interface ScenarioOutcome {
  readonly name: ScenarioName;
  readonly status: "PASS" | "FAIL";
  readonly details: readonly string[];
  readonly startedAtIso: string;
  readonly finishedAtIso: string;
}

interface TransportCall {
  readonly method: "sendMessage" | "sendPhoto";
  readonly chatId: number;
  readonly text?: string;
  readonly imageAbsolutePath?: string;
  readonly caption?: string;
}

const SCENARIOS: readonly ScenarioName[] = [
  "image-send-photo-success",
  "text-regression-send-message",
  "send-photo-unavailable-fallback",
  "oversize-photo-send-document",
  "unsafe-run-dir-zero-send",
  "unsafe-image-zero-send",
  "bad-metadata-zero-send",
  "caption-truncation-preserves-commands",
  "bot-transport-send-photo-static",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(
  tmpdir(),
  `cz-telegram-image-approval-smoke-${new Date().toISOString().replaceAll(":", "-")}`,
);
const docPath = resolve(
  repoRoot,
  "docs",
  "preflight",
  "telegram-image-approval-smoke.md",
);

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
    case "image-send-photo-success":
      return runImageSendPhotoSuccess(dir);
    case "text-regression-send-message":
      return runTextRegressionSendMessage(dir);
    case "send-photo-unavailable-fallback":
      return runSendPhotoUnavailableFallback(dir);
    case "oversize-photo-send-document":
      return runOversizePhotoSendDocument(dir);
    case "unsafe-run-dir-zero-send":
      return runUnsafeRunDirZeroSend(dir);
    case "unsafe-image-zero-send":
      return runUnsafeImageZeroSend(dir);
    case "bad-metadata-zero-send":
      return runBadMetadataZeroSend(dir);
    case "caption-truncation-preserves-commands":
      return runCaptionTruncationPreservesCommands(dir);
    case "bot-transport-send-photo-static":
      return runBotTransportSendPhotoStatic();
  }
}

async function runImageSendPhotoSuccess(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const jobId = "img-send-photo-success";
    seedImageJob(db, jobId);
    writeSafeAttempt(dir, jobId, 1);

    const calls: TransportCall[] = [];
    const result = await notifyWithTransport(db, dir, recordingTransport(calls));

    assert(result.sent === 1, `expected one sent row, got ${result.sent}`);
    assert(calls.length === 1, `expected exactly one transport call, got ${calls.length}`);
    assert(calls[0]?.method === "sendPhoto", `expected sendPhoto, got ${calls[0]?.method}`);
    assert(calls[0]?.imageAbsolutePath?.endsWith(`${path.sep}image.png`) === true, "photo path did not point to image.png");
    assert(calls[0]?.caption?.includes("Verdict: PASS") === true, "caption omitted verdict");
    assert(calls[0]?.caption?.includes("Criteria: 3/3 pass") === true, "caption omitted criteria count");
    assert(calls[0]?.caption?.includes(`/approve ${jobId} 1`) === true, "caption omitted approve command");
    assert(calls[0]?.caption?.includes(`/reject ${jobId} 1`) === true, "caption omitted reject command");
    assert(findEventsByJob(db, jobId, "notified").length === 1, "notified event missing");
    assert(findEventsByJob(db, jobId, "notify_failed").length === 0, "unexpected notify_failed event");

    return [
      "Safe image job sent one Telegram photo attachment.",
      "Caption included verdict, 3/3 criteria count, and approve/reject command hints.",
    ];
  } finally {
    db.close();
  }
}

async function runTextRegressionSendMessage(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const jobId = "text-regression";
    const summary = "Approval Summary\n\nStored text report summary.";
    seedTextJob(db, jobId, { approval_summary: summary });

    const calls: TransportCall[] = [];
    const result = await notifyWithTransport(db, dir, recordingTransport(calls));
    const expected = formatApprovalNotification({
      jobId,
      attemptNumber: 1,
      approvalSummary: summary,
    });

    assert(result.sent === 1, `expected one sent row, got ${result.sent}`);
    assert(calls.length === 1, `expected one transport call, got ${calls.length}`);
    assert(calls[0]?.method === "sendMessage", `expected sendMessage, got ${calls[0]?.method}`);
    assert(calls[0]?.text === expected, "text notification contract changed");

    return [
      "Text report awaiting approval still used sendMessage.",
      "Message matched the exact formatApprovalNotification output.",
    ];
  } finally {
    db.close();
  }
}

async function runSendPhotoUnavailableFallback(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const jobId = "img-no-photo-transport";
    seedImageJob(db, jobId);
    writeSafeAttempt(dir, jobId, 1);

    const calls: TransportCall[] = [];
    const result = await notifyWithTransport(db, dir, {
      sendMessage(chatId, text) {
        calls.push({ method: "sendMessage", chatId, text });
      },
    });

    assert(result.sent === 1, `expected one sent row, got ${result.sent}`);
    assert(calls.length === 1, `expected one fallback message, got ${calls.length}`);
    assert(calls[0]?.method === "sendMessage", "fallback did not use sendMessage");
    assert(
      calls[0]?.text?.startsWith("IMAGE PREVIEW UNAVAILABLE - inspect locally before approving.") === true,
      "fallback warning was not explicit",
    );
    assert(calls[0]?.text?.includes(`bun run content:image-show ${jobId} --artifact image`) === true, "fallback omitted image inspection command");
    assert(calls[0]?.text?.includes(`bun run content:image-show ${jobId} --artifact verdict`) === true, "fallback omitted verdict inspection command");

    return [
      "SendPhoto-less transport used a warning sendMessage fallback.",
      "Fallback told the operator to inspect local image and verdict artifacts before approving.",
    ];
  } finally {
    db.close();
  }
}

async function runOversizePhotoSendDocument(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const jobId = "img-oversize-document";
    seedImageJob(db, jobId);
    writeSafeAttempt(dir, jobId, 1, { imagePadBytes: 10 * 1024 * 1024 + 8 });

    const endpoints: string[] = [];
    const transport = createTelegramHttpTransport({
      token: "fake-token",
      apiRoot: "https://telegram.invalid",
      fetchImpl: (async (input: string | URL | Request) => {
        endpoints.push(String(input));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const result = await notifyWithTransport(db, dir, transport);

    assert(result.sent === 1, `expected one sent row, got ${result.sent}`);
    assert(endpoints.length === 1, `expected one HTTP call, got ${endpoints.length}`);
    assert(endpoints[0]?.endsWith("/sendDocument") === true, `expected sendDocument endpoint, got ${endpoints[0]}`);
    assert(!endpoints.some((endpoint) => endpoint.endsWith("/sendMessage")), "oversize image became blind text approval");

    return [
      "Validated oversize PNG still passed notifier artifact gates.",
      "HTTP transport selected sendDocument locally instead of blind text fallback.",
    ];
  } finally {
    db.close();
  }
}

async function runUnsafeRunDirZeroSend(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const cases: Array<readonly [string, string]> = [
      ["unsafe-absolute", resolve(dir, ".runs", "unsafe-absolute")],
      ["unsafe-parent", `.runs/${"unsafe-parent"}/../unsafe-parent`],
      ["unsafe-sibling", ".runs/other-job"],
      ["unsafe-mismatch", ".runs/unsafe-mismatch-extra"],
      ["unsafe-run-root-symlink", ".runs/unsafe-run-root-symlink"],
    ];
    for (const [jobId, runDir] of cases) {
      seedImageJob(db, jobId, { run_dir: runDir });
      if (jobId === "unsafe-run-root-symlink") {
        writeSafeAttempt(dir, "unsafe-run-root-target", 1);
        symlinkSync(
          "unsafe-run-root-target",
          resolve(dir, ".runs", "unsafe-run-root-symlink"),
          "dir",
        );
      } else {
        writeSafeAttempt(dir, jobId, 1);
      }
    }

    const calls: TransportCall[] = [];
    const result = await notifyWithTransport(db, dir, recordingTransport(calls), cases.length);

    assert(result.failed === cases.length, `expected ${cases.length} failures, got ${result.failed}`);
    assert(calls.length === 0, `expected zero transport calls, got ${calls.length}`);
    for (const [jobId] of cases) {
      assert(findEventsByJob(db, jobId, "notify_failed").length === 1, `${jobId} missing notify_failed`);
      assert(findEventsByJob(db, jobId, "notified").length === 0, `${jobId} recorded notified`);
      assert(requireJob(db, jobId).notified_at === null, `${jobId} set notified_at`);
    }

    return [
      "Absolute, parent-traversal, sibling, mismatched, and symlinked run_dir cases failed closed.",
      "Each case recorded notify_failed with zero sender calls and no notified event.",
    ];
  } finally {
    db.close();
  }
}

async function runUnsafeImageZeroSend(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const cases: Array<readonly [string, (attemptDir: string) => void]> = [
      ["unsafe-image-symlink", (attemptDir) => {
        writeFileSync(resolve(attemptDir, "outside.png"), "not really outside");
        rmSync(resolve(attemptDir, "image.png"), { force: true });
        symlinkSync("outside.png", resolve(attemptDir, "image.png"));
      }],
      ["unsafe-image-directory", (attemptDir) => {
        rmSync(resolve(attemptDir, "image.png"), { force: true });
        mkdirSync(resolve(attemptDir, "image.png"));
      }],
      ["unsafe-image-missing", (attemptDir) => {
        rmSync(resolve(attemptDir, "image.png"), { force: true });
      }],
      ["unsafe-image-non-png", (attemptDir) => {
        writeFileSync(resolve(attemptDir, "image.png"), "not a png\n");
      }],
      ["unsafe-image-bad-ihdr", (attemptDir) => {
        writeFileSync(
          resolve(attemptDir, "image.png"),
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 1, 0x42]),
        );
      }],
    ];

    for (const [jobId, mutate] of cases) {
      seedImageJob(db, jobId);
      const attemptDir = writeSafeAttempt(dir, jobId, 1);
      mutate(attemptDir);
    }

    const calls: TransportCall[] = [];
    const result = await notifyWithTransport(db, dir, recordingTransport(calls), cases.length);

    assert(result.failed === cases.length, `expected ${cases.length} failures, got ${result.failed}`);
    assert(calls.length === 0, `expected zero transport calls, got ${calls.length}`);
    for (const [jobId] of cases) {
      assert(findEventsByJob(db, jobId, "notify_failed").length === 1, `${jobId} missing notify_failed`);
      assert(findEventsByJob(db, jobId, "notified").length === 0, `${jobId} recorded notified`);
    }

    return [
      "Symlink, directory, missing image, non-PNG, and bad-IHDR image cases failed closed.",
      "Unsafe image cases made zero sender calls and recorded only notify_failed.",
    ];
  } finally {
    db.close();
  }
}

async function runBadMetadataZeroSend(dir: string): Promise<string[]> {
  const db = openScenarioDb(dir);
  try {
    const cases: Array<readonly [string, (attemptDir: string) => void]> = [
      ["bad-meta-missing-spec", (attemptDir) => rmSync(resolve(attemptDir, "spec.json"), { force: true })],
      ["bad-meta-unparseable-spec", (attemptDir) => writeFileSync(resolve(attemptDir, "spec.json"), "{ nope\n")],
      ["bad-meta-missing-verdict", (attemptDir) => rmSync(resolve(attemptDir, "verdict.json"), { force: true })],
      ["bad-meta-unparseable-verdict", (attemptDir) => writeFileSync(resolve(attemptDir, "verdict.json"), "{ nope\n")],
    ];

    for (const [jobId, mutate] of cases) {
      seedImageJob(db, jobId);
      const attemptDir = writeSafeAttempt(dir, jobId, 1);
      mutate(attemptDir);
    }

    const calls: TransportCall[] = [];
    const result = await notifyWithTransport(db, dir, recordingTransport(calls), cases.length);

    assert(result.failed === cases.length, `expected ${cases.length} failures, got ${result.failed}`);
    assert(calls.length === 0, `expected zero transport calls, got ${calls.length}`);
    for (const [jobId] of cases) {
      assert(findEventsByJob(db, jobId, "notify_failed").length === 1, `${jobId} missing notify_failed`);
      assert(findEventsByJob(db, jobId, "notified").length === 0, `${jobId} recorded notified`);
    }

    return [
      "Missing and unparseable spec.json/verdict.json cases failed closed.",
      "Metadata failures made zero sender calls and recorded no notified events.",
    ];
  } finally {
    db.close();
  }
}

async function runCaptionTruncationPreservesCommands(dir: string): Promise<string[]> {
  const firstCaption = await captureLongCaption(resolve(dir, "first"));
  const secondCaption = await captureLongCaption(resolve(dir, "second"));

  assert(firstCaption === secondCaption, "caption truncation was not deterministic");
  assert(firstCaption.length <= 1024, `caption length ${firstCaption.length} exceeded Telegram photo limit`);
  assert(firstCaption.includes("/approve caption-long 1"), "truncated caption lost approve command");
  assert(firstCaption.includes("/reject caption-long 1"), "truncated caption lost reject command");
  assert(firstCaption.includes("Verdict: PASS"), "truncated caption lost verdict");
  assert(firstCaption.includes("Criteria: 3/3 pass"), "truncated caption lost criteria count");

  return [
    `Long caption truncated deterministically to ${firstCaption.length} chars.`,
    "Approve/reject command hints, verdict, and criteria count survived truncation.",
  ];
}

function runBotTransportSendPhotoStatic(): string[] {
  const botSource = readFileSync(resolve(repoRoot, "src/telegram/bot.ts"), "utf8");
  const transportInterface = extractInterfaceBody(botSource, "TelegramTransport");
  const commandsSource = readFileSync(
    resolve(repoRoot, "src/telegram/commands.ts"),
    "utf8",
  );

  assert(/sendPhoto\?\(/.test(transportInterface), "TelegramTransport lacks optional sendPhoto");
  assert(!/sendDocument\?\(/.test(transportInterface), "TelegramTransport exposes public sendDocument");
  assert(/createTelegramSender[\s\S]*\.sendPhoto/.test(botSource), "sender does not branch to sendPhoto");
  assert(/sendDocument/.test(botSource), "HTTP transport lacks document fallback");
  assert(/cwd:\s*dependencies\.cwd/.test(botSource), "bot tick does not pass cwd to notifier");
  assert(!/sendPhoto|sendDocument|caption|imageAbsolutePath/.test(commandsSource), "command handlers changed for image upload transport");

  return [
    "Static check found additive sendPhoto transport support, private document fallback, and cwd notifier wiring.",
    "src/telegram/commands.ts contains no image-upload transport changes.",
  ];
}

function extractInterfaceBody(source: string, interfaceName: string): string {
  const match = new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`).exec(source);
  assert(match !== null, `${interfaceName} interface missing`);
  return match[1] ?? "";
}

async function captureLongCaption(dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const db = openScenarioDb(dir);
  try {
    const jobId = "caption-long";
    seedImageJob(db, jobId);
    writeSafeAttempt(dir, jobId, 1, {
      spec: validImageSpec({
        subject: `approval subject ${"x".repeat(1600)}`,
      }),
    });

    const calls: TransportCall[] = [];
    await notifyWithTransport(db, dir, recordingTransport(calls));
    const caption = calls[0]?.caption;
    assert(caption !== undefined, "missing image caption");
    return caption;
  } finally {
    db.close();
  }
}

async function notifyWithTransport(
  db: DbClient,
  cwd: string,
  transport: TelegramTransport,
  limit = 10,
) {
  return notifyPendingApprovals({
    db,
    cwd,
    now: createClock().now,
    sleep: async () => undefined,
    retryDelaysMs: [],
    limit,
    sender: createTelegramSender({ chatIds: [12345], transport }),
  });
}

function recordingTransport(calls: TransportCall[]): TelegramTransport {
  return {
    sendMessage(chatId, text) {
      calls.push({ method: "sendMessage", chatId, text });
    },
    sendPhoto(chatId, imageAbsolutePath, caption) {
      calls.push({ method: "sendPhoto", chatId, imageAbsolutePath, caption });
    },
  };
}

function openScenarioDb(dir: string): DbClient {
  return openDb(resolve(dir, "content.db"));
}

function seedImageJob(
  db: DbClient,
  id: string,
  patch: Partial<Job> = {},
): Job {
  return seedJob(db, id, {
    modality: "image",
    current_stage: "judge",
    run_dir: `.runs/${id}`,
    approval_summary: "Image approval summary",
    ...patch,
  });
}

function seedTextJob(
  db: DbClient,
  id: string,
  patch: Partial<Job> = {},
): Job {
  return seedJob(db, id, {
    modality: "text_report",
    current_stage: "approval",
    approval_summary: "Text approval summary",
    ...patch,
  });
}

function seedJob(db: DbClient, id: string, patch: Partial<Job>): Job {
  const now = 1_800_000_000 + id.length;
  return insertJob(db, {
    id,
    week_key: patch.week_key ?? `2026-${id}`,
    topic: patch.topic ?? `Topic for ${id}`,
    locales: patch.locales ?? "en,zh",
    modality: patch.modality ?? "text_report",
    attempt_number: patch.attempt_number ?? 1,
    status: patch.status ?? "awaiting_approval",
    current_stage: patch.current_stage ?? "approval",
    purpose: patch.purpose ?? "validation",
    run_dir: patch.run_dir ?? null,
    approval_summary: patch.approval_summary ?? null,
    notified_at: patch.notified_at ?? null,
    last_notify_error: patch.last_notify_error ?? null,
    created_at: patch.created_at ?? now - 10,
    updated_at: patch.updated_at ?? now,
  });
}

function writeSafeAttempt(
  cwd: string,
  jobId: string,
  attemptNumber: number,
  options: {
    readonly spec?: ImageSpec;
    readonly verdict?: JudgeVerdict;
    readonly imagePadBytes?: number;
  } = {},
): string {
  const attemptDir = resolve(cwd, ".runs", jobId, `attempt-${attemptNumber}`);
  mkdirSync(attemptDir, { recursive: true });
  const spec = options.spec ?? validImageSpec();
  writeFileSync(resolve(attemptDir, "spec.json"), `${JSON.stringify(spec, null, 2)}\n`);
  writePng(
    resolve(attemptDir, "image.png"),
    spec.dimensions.w,
    spec.dimensions.h,
    options.imagePadBytes ?? 0,
  );
  writeFileSync(
    resolve(attemptDir, "verdict.json"),
    `${JSON.stringify(options.verdict ?? passingVerdict(), null, 2)}\n`,
  );
  return attemptDir;
}

function writePng(
  filePath: string,
  width: number,
  height: number,
  padBytes = 0,
): void {
  const bytes = Buffer.alloc(33 + padBytes);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 2;
  bytes[26] = 0;
  bytes[27] = 0;
  bytes[28] = 0;
  writeFileSync(filePath, bytes);
}

function createClock(start = 1_900_000_000): { now: () => number } {
  let value = start;
  return {
    now: () => {
      value += 1;
      return value;
    },
  };
}

function requireJob(db: DbClient, id: string): Job {
  const job = findJobById(db, id);
  assert(job !== null, `missing job ${id}`);
  return job;
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  const lines = [
    "# Telegram Image Approval Smoke Evidence",
    "",
    `- Command: \`bun run telegram-image-approval-smoke\``,
    `- Generated: ${new Date().toISOString()}`,
    `- Result: ${passed}/${outcomes.length} PASS`,
    "- Evidence ceiling: hermetic smoke/static evidence only; no live Telegram client observation.",
    "",
    "| Scenario | Status | Details |",
    "| --- | --- | --- |",
  ];

  for (const outcome of outcomes) {
    lines.push(
      `| ${outcome.name} | ${outcome.status} | ${outcome.details.map(escapeCell).join("<br>")} |`,
    );
  }

  lines.push(
    "",
    "## External Execution",
    "",
    "- No real Telegram network call was made; HTTP behavior used an injected fake fetch.",
    "- No real bot token, chat id, image provider, vision judge, or `content:image-run` execution was used.",
    "- Temporary DB and `.runs` artifacts were created under the OS temp directory and removed in a `finally` path.",
  );

  mkdirSync(dirname(docPath), { recursive: true });
  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

function escapeCell(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\n", "<br>");
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  return String(err);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

process.exit(await main());
