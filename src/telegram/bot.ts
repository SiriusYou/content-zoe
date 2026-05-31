import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import { openDb as defaultOpenDb, type DbClient } from "../db.ts";
import {
  notifyPendingApprovals as defaultNotifyPendingApprovals,
  type ApprovalNotification,
  type ApprovalNotificationSender,
  type NotifyPendingApprovalsResult,
} from "./notifier.ts";
import { parseOperatorChatIds } from "./allowlist.ts";
import {
  handleApproveCommand,
  handleRejectCommand,
  handleStatusCommand,
} from "./commands.ts";
import type { GitCommitter, PromoteJobHooks } from "../promote.ts";

export const TELEGRAM_BOT_TOKEN_ENV = "TELEGRAM_BOT_TOKEN";
export const OPERATOR_CHAT_IDS_ENV = "OPERATOR_CHAT_IDS";
export const DEFAULT_TICK_INTERVAL_MS = 10_000;
export const DEFAULT_COMMAND_POLL_INTERVAL_MS = 2_000;
export const DEFAULT_COMMAND_LONG_POLL_TIMEOUT_SECONDS = 30;

export interface BotConfig {
  readonly token: string;
  readonly operatorChatIds: readonly number[];
  readonly dbPath: string;
  readonly tickIntervalMs: number;
  readonly cwd?: string;
}

export interface BotConfigFailure {
  readonly ok: false;
  readonly errors: readonly string[];
}

export interface BotConfigSuccess {
  readonly ok: true;
  readonly config: BotConfig;
}

export type BotConfigResult = BotConfigSuccess | BotConfigFailure;

export interface LoadBotConfigOptions {
  readonly env?: Record<string, string | undefined>;
  readonly cwd?: string;
  readonly dbPath?: string;
  readonly tickIntervalMs?: number;
}

export interface TelegramTransport {
  sendMessage(chatId: number, text: string): Promise<void> | void;
  sendPhoto?(
    chatId: number,
    imageAbsolutePath: string,
    caption: string,
  ): Promise<void> | void;
  sendDocument?(
    chatId: number,
    imageAbsolutePath: string,
    caption: string,
  ): Promise<void> | void;
}

export interface TelegramHttpTransportOptions {
  readonly token: string;
  readonly fetchImpl?: typeof fetch;
  readonly apiRoot?: string;
}

export type TelegramCommandName = "approve" | "reject" | "status";

export interface TelegramCommandContext {
  readonly chatId: number;
  readonly text: string;
  reply(text: string): Promise<void> | void;
}

export type TelegramCommandHandler = (
  context: TelegramCommandContext,
) => Promise<void> | void;

export interface TelegramCommandTransport {
  onCommand(command: TelegramCommandName, handler: TelegramCommandHandler): void;
  start(): void;
  stop(): void;
}

export interface TelegramHttpCommandTransportOptions
  extends TelegramHttpTransportOptions {
  readonly timer?: RuntimeTimer;
  readonly pollIntervalMs?: number;
  readonly onError?: (err: unknown) => void;
}

export interface CreateTelegramSenderOptions {
  readonly chatIds: readonly number[];
  readonly transport: TelegramTransport;
}

export interface TickDependencies {
  readonly dbPath: string;
  readonly cwd: string;
  readonly openDb: (dbPath: string) => DbClient;
  readonly sender: ApprovalNotificationSender;
  readonly notifyPendingApprovals: typeof defaultNotifyPendingApprovals;
  readonly now: () => number;
  readonly sleep: (delayMs: number) => Promise<void> | void;
}

export interface BotTickResult {
  readonly status: "ran" | "skipped";
  readonly notifierResult?: NotifyPendingApprovalsResult;
}

export interface BotTick {
  tick(): Promise<BotTickResult>;
}

export interface RuntimeTimer {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface StartBotRuntimeOptions {
  readonly config?: BotConfig;
  readonly configLoader?: () => BotConfigResult;
  readonly openDb?: (dbPath: string) => DbClient;
  readonly sender?: ApprovalNotificationSender;
  readonly transport?: TelegramTransport;
  readonly commandTransport?: TelegramCommandTransport;
  readonly notifyPendingApprovals?: typeof defaultNotifyPendingApprovals;
  readonly now?: () => number;
  readonly sleep?: (delayMs: number) => Promise<void> | void;
  readonly timer?: RuntimeTimer;
  readonly onTickError?: (err: unknown) => void;
  readonly onCommandError?: (err: unknown) => void;
  readonly cwd?: string;
  readonly committer?: GitCommitter;
  readonly publishHooks?: PromoteJobHooks;
}

export interface BotRuntime {
  readonly config: BotConfig;
  readonly tick: () => Promise<BotTickResult>;
  stop(): void;
}

export class BotConfigError extends Error {
  readonly name = "BotConfigError";
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`invalid Telegram bot config: ${errors.join("; ")}`);
    this.errors = errors;
  }
}

export function defaultBotDbPath(cwd: string): string {
  return path.resolve(cwd, ".data/content.db");
}

export function loadBotConfig(options: LoadBotConfigOptions = {}): BotConfigResult {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const errors: string[] = [];

  const token = env[TELEGRAM_BOT_TOKEN_ENV]?.trim() ?? "";
  if (token.length === 0) {
    errors.push(`${TELEGRAM_BOT_TOKEN_ENV} is required`);
  }

  const allowlist = parseOperatorChatIds(env[OPERATOR_CHAT_IDS_ENV]);
  if (!allowlist.valid) {
    errors.push(`${OPERATOR_CHAT_IDS_ENV} must be a comma-separated integer allowlist`);
  }

  const tickIntervalMs = normalizeTickIntervalMs(
    options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS,
  );
  if (tickIntervalMs === null) {
    errors.push("tickIntervalMs must be a positive finite integer");
  }

  if (errors.length > 0 || tickIntervalMs === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      token,
      operatorChatIds: allowlist.chatIds,
      dbPath: options.dbPath ?? defaultBotDbPath(cwd),
      tickIntervalMs,
      cwd,
    },
  };
}

export function createTelegramSender(
  options: CreateTelegramSenderOptions,
): ApprovalNotificationSender {
  const chatIds = [...options.chatIds];
  return async (notification: ApprovalNotification): Promise<void> => {
    await Promise.all(
      chatIds.map((chatId) => {
        if (
          notification.imageAbsolutePath !== undefined &&
          notification.caption !== undefined &&
          options.transport.sendPhoto !== undefined
        ) {
          return options.transport.sendPhoto(
            chatId,
            notification.imageAbsolutePath,
            notification.caption,
          );
        }
        return options.transport.sendMessage(chatId, notification.text);
      }),
    );
  };
}

export function createTelegramHttpTransport(
  options: TelegramHttpTransportOptions,
): TelegramTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiRoot = options.apiRoot ?? "https://api.telegram.org";
  return {
    async sendMessage(chatId: number, text: string): Promise<void> {
      const response = await fetchImpl(
        `${apiRoot}/bot${options.token}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text }),
        },
      );

      if (!response.ok) {
        throw new Error(`Telegram sendMessage failed with HTTP ${response.status}`);
      }
    },
    async sendPhoto(
      chatId: number,
      imageAbsolutePath: string,
      caption: string,
    ): Promise<void> {
      if (await isTelegramPhotoSuitable(imageAbsolutePath)) {
        await sendMultipartTelegram({
          fetchImpl,
          apiRoot,
          token: options.token,
          method: "sendPhoto",
          fieldName: "photo",
          chatId,
          imageAbsolutePath,
          caption,
        });
        return;
      }

      await sendMultipartTelegram({
        fetchImpl,
        apiRoot,
        token: options.token,
        method: "sendDocument",
        fieldName: "document",
        chatId,
        imageAbsolutePath,
        caption,
      });
    },
    async sendDocument(
      chatId: number,
      imageAbsolutePath: string,
      caption: string,
    ): Promise<void> {
      await sendMultipartTelegram({
        fetchImpl,
        apiRoot,
        token: options.token,
        method: "sendDocument",
        fieldName: "document",
        chatId,
        imageAbsolutePath,
        caption,
      });
    },
  };
}

export function createTelegramHttpCommandTransport(
  options: TelegramHttpCommandTransportOptions,
): TelegramCommandTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiRoot = options.apiRoot ?? "https://api.telegram.org";
  const timer = options.timer ?? defaultRuntimeTimer();
  const pollIntervalMs =
    options.pollIntervalMs ?? DEFAULT_COMMAND_POLL_INTERVAL_MS;
  const onError =
    options.onError ??
    ((err: unknown) => {
      console.error(err);
    });
  const handlers = new Map<TelegramCommandName, TelegramCommandHandler>();
  const sender = createTelegramHttpTransport({
    token: options.token,
    fetchImpl,
    apiRoot,
  });
  let offset = 0;
  let running = false;
  let intervalHandle: unknown;

  async function poll(): Promise<void> {
    if (running) {
      return;
    }

    running = true;
    try {
      const url = new URL(`${apiRoot}/bot${options.token}/getUpdates`);
      url.searchParams.set(
        "timeout",
        String(DEFAULT_COMMAND_LONG_POLL_TIMEOUT_SECONDS),
      );
      if (offset > 0) {
        url.searchParams.set("offset", String(offset));
      }

      const response = await fetchImpl(url, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Telegram getUpdates failed with HTTP ${response.status}`);
      }

      const body = (await response.json()) as {
        ok?: boolean;
        result?: readonly TelegramUpdate[];
      };
      if (body.ok !== true || !Array.isArray(body.result)) {
        throw new Error("Telegram getUpdates returned malformed payload");
      }

      for (const update of body.result) {
        if (typeof update.update_id === "number") {
          offset = Math.max(offset, update.update_id + 1);
        }

        const text = update.message?.text;
        const chatId = update.message?.chat?.id;
        if (typeof text !== "string" || typeof chatId !== "number") {
          continue;
        }

        const command = commandNameFromText(text);
        const handler = command === null ? undefined : handlers.get(command);
        if (handler === undefined) {
          continue;
        }

        await handler({
          chatId,
          text,
          reply(replyText) {
            return sender.sendMessage(chatId, replyText);
          },
        });
      }
    } finally {
      running = false;
    }
  }

  return {
    onCommand(command, handler): void {
      handlers.set(command, handler);
    },
    start(): void {
      if (intervalHandle !== undefined) {
        return;
      }
      intervalHandle = timer.setInterval(() => {
        void poll().catch(onError);
      }, pollIntervalMs);
      void poll().catch(onError);
    },
    stop(): void {
      if (intervalHandle !== undefined) {
        timer.clearInterval(intervalHandle);
        intervalHandle = undefined;
      }
    },
  };
}

export interface RegisterRejectCommandOptions {
  readonly dbPath: string;
  readonly operatorChatIds: readonly number[];
  readonly openDb: (dbPath: string) => DbClient;
  readonly now: () => number;
}

export interface RegisterApproveCommandOptions {
  readonly dbPath: string;
  readonly operatorChatIds: readonly number[];
  readonly openDb: (dbPath: string) => DbClient;
  readonly cwd: string;
  readonly now: () => number;
  readonly committer?: GitCommitter;
  readonly publishHooks?: PromoteJobHooks;
}

export interface RegisterStatusCommandOptions {
  readonly dbPath: string;
  readonly operatorChatIds: readonly number[];
  readonly openDb: (dbPath: string) => DbClient;
  readonly now: () => number;
}

export function registerApproveCommand(
  commandTransport: TelegramCommandTransport,
  options: RegisterApproveCommandOptions,
): void {
  commandTransport.onCommand("approve", async (context) => {
    const db = options.openDb(options.dbPath);
    try {
      await handleApproveCommand({
        db,
        text: context.text,
        chatId: context.chatId,
        operatorChatIds: options.operatorChatIds,
        cwd: options.cwd,
        now: options.now,
        committer: options.committer,
        publishHooks: options.publishHooks,
        reply: (text) => context.reply(text),
      });
    } finally {
      db.close();
    }
  });
}

export function registerStatusCommand(
  commandTransport: TelegramCommandTransport,
  options: RegisterStatusCommandOptions,
): void {
  commandTransport.onCommand("status", async (context) => {
    const db = options.openDb(options.dbPath);
    try {
      await handleStatusCommand({
        db,
        text: context.text,
        chatId: context.chatId,
        operatorChatIds: options.operatorChatIds,
        now: options.now,
        reply: (text) => context.reply(text),
      });
    } finally {
      db.close();
    }
  });
}

export function registerRejectCommand(
  commandTransport: TelegramCommandTransport,
  options: RegisterRejectCommandOptions,
): void {
  commandTransport.onCommand("reject", async (context) => {
    const db = options.openDb(options.dbPath);
    try {
      await handleRejectCommand({
        db,
        text: context.text,
        chatId: context.chatId,
        operatorChatIds: options.operatorChatIds,
        now: options.now,
        reply: (text) => context.reply(text),
      });
    } finally {
      db.close();
    }
  });
}

export function createBotTick(dependencies: TickDependencies): BotTick {
  let running = false;

  return {
    async tick(): Promise<BotTickResult> {
      if (running) {
        return { status: "skipped" };
      }

      running = true;
      let db: DbClient | undefined;
      try {
        db = dependencies.openDb(dependencies.dbPath);
        const notifierResult = await dependencies.notifyPendingApprovals({
          db,
          sender: dependencies.sender,
          now: dependencies.now,
          sleep: dependencies.sleep,
          cwd: dependencies.cwd,
        });
        return { status: "ran", notifierResult };
      } finally {
        try {
          db?.close();
        } finally {
          running = false;
        }
      }
    },
  };
}

export function startBotRuntime(options: StartBotRuntimeOptions = {}): BotRuntime {
  const configResult = options.config
    ? { ok: true as const, config: options.config }
    : (options.configLoader ?? loadBotConfig)();
  if (!configResult.ok) {
    throw new BotConfigError(configResult.errors);
  }

  const config = configResult.config;
  const cwd = config.cwd ?? options.cwd ?? process.cwd();
  const openDb = options.openDb ?? defaultOpenDb;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const transport = options.transport ?? createTelegramHttpTransport({ token: config.token });
  const sender =
    options.sender ??
    createTelegramSender({ chatIds: config.operatorChatIds, transport });
  const tickController = createBotTick({
    dbPath: config.dbPath,
    cwd,
    openDb,
    sender,
    notifyPendingApprovals:
      options.notifyPendingApprovals ?? defaultNotifyPendingApprovals,
    now,
    sleep: options.sleep ?? ((delayMs) => Bun.sleep(delayMs)),
  });
  const timer = options.timer ?? defaultRuntimeTimer();
  const onTickError =
    options.onTickError ??
    ((err: unknown) => {
      console.error(err);
    });
  const onCommandError =
    options.onCommandError ??
    ((err: unknown) => {
      console.error(err);
    });
  const commandTransport =
    options.commandTransport ??
    createTelegramHttpCommandTransport({
      token: config.token,
      timer,
      onError: onCommandError,
    });
  registerApproveCommand(commandTransport, {
    dbPath: config.dbPath,
    operatorChatIds: config.operatorChatIds,
    openDb,
    cwd,
    now,
    committer: options.committer,
    publishHooks: options.publishHooks,
  });
  registerRejectCommand(commandTransport, {
    dbPath: config.dbPath,
    operatorChatIds: config.operatorChatIds,
    openDb,
    now,
  });
  registerStatusCommand(commandTransport, {
    dbPath: config.dbPath,
    operatorChatIds: config.operatorChatIds,
    openDb,
    now,
  });
  const handle = timer.setInterval(() => {
    void tickController.tick().catch(onTickError);
  }, config.tickIntervalMs);
  commandTransport.start();

  return {
    config,
    tick: tickController.tick,
    stop(): void {
      timer.clearInterval(handle);
      commandTransport.stop();
    },
  };
}

const TELEGRAM_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const TELEGRAM_PHOTO_MAX_DIMENSION_SUM = 10_000;
const TELEGRAM_PHOTO_MAX_ASPECT_RATIO = 20;

async function sendMultipartTelegram(args: {
  readonly fetchImpl: typeof fetch;
  readonly apiRoot: string;
  readonly token: string;
  readonly method: "sendPhoto" | "sendDocument";
  readonly fieldName: "photo" | "document";
  readonly chatId: number;
  readonly imageAbsolutePath: string;
  readonly caption: string;
}): Promise<void> {
  const bytes = await readFile(args.imageAbsolutePath);
  const form = new FormData();
  form.append("chat_id", String(args.chatId));
  form.append("caption", args.caption);
  form.append(
    args.fieldName,
    new Blob([bytes], { type: "image/png" }),
    "image.png",
  );

  const response = await args.fetchImpl(
    `${args.apiRoot}/bot${args.token}/${args.method}`,
    {
      method: "POST",
      body: form,
    },
  );

  if (!response.ok) {
    throw new Error(`Telegram ${args.method} failed with HTTP ${response.status}`);
  }
}

async function isTelegramPhotoSuitable(imageAbsolutePath: string): Promise<boolean> {
  const fileStat = await stat(imageAbsolutePath);
  if (fileStat.size > TELEGRAM_PHOTO_MAX_BYTES) {
    return false;
  }

  const bytes = await readFile(imageAbsolutePath);
  const dimensions = parsePngDimensions(bytes);
  const larger = Math.max(dimensions.width, dimensions.height);
  const smaller = Math.min(dimensions.width, dimensions.height);
  return (
    dimensions.width + dimensions.height <= TELEGRAM_PHOTO_MAX_DIMENSION_SUM &&
    larger / smaller <= TELEGRAM_PHOTO_MAX_ASPECT_RATIO
  );
}

function parsePngDimensions(bytes: Buffer): {
  readonly width: number;
  readonly height: number;
} {
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error("Telegram image upload requires a PNG with parseable IHDR");
  }

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width <= 0 || height <= 0) {
    throw new Error("Telegram image upload PNG dimensions must be positive");
  }
  return { width, height };
}

interface TelegramUpdate {
  readonly update_id?: number;
  readonly message?: {
    readonly text?: string;
    readonly chat?: {
      readonly id?: number;
    };
  };
}

function commandNameFromText(text: string): TelegramCommandName | null {
  const trimmed = text.trim();
  if (/^\/approve(?:@\w+)?(?:\s|$)/.test(trimmed)) {
    return "approve";
  }
  if (/^\/reject(?:@\w+)?(?:\s|$)/.test(trimmed)) {
    return "reject";
  }
  if (/^\/status(?:@\w+)?(?:\s|$)/.test(trimmed)) {
    return "status";
  }
  return null;
}

function defaultRuntimeTimer(): RuntimeTimer {
  return {
    setInterval(callback: () => void, delayMs: number): unknown {
      return setInterval(callback, delayMs);
    },
    clearInterval(handle: unknown): void {
      clearInterval(handle as ReturnType<typeof setInterval>);
    },
  };
}

function normalizeTickIntervalMs(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

if (import.meta.main) {
  const runtime = startBotRuntime();
  const stop = (): void => {
    runtime.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
