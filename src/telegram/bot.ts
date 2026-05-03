import path from "node:path";

import { openDb as defaultOpenDb, type DbClient } from "../db.ts";
import {
  notifyPendingApprovals as defaultNotifyPendingApprovals,
  type ApprovalNotification,
  type ApprovalNotificationSender,
  type NotifyPendingApprovalsResult,
} from "./notifier.ts";
import { parseOperatorChatIds } from "./allowlist.ts";

export const TELEGRAM_BOT_TOKEN_ENV = "TELEGRAM_BOT_TOKEN";
export const OPERATOR_CHAT_IDS_ENV = "OPERATOR_CHAT_IDS";
export const DEFAULT_TICK_INTERVAL_MS = 10_000;

export interface BotConfig {
  readonly token: string;
  readonly operatorChatIds: readonly number[];
  readonly dbPath: string;
  readonly tickIntervalMs: number;
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
}

export interface TelegramHttpTransportOptions {
  readonly token: string;
  readonly fetchImpl?: typeof fetch;
  readonly apiRoot?: string;
}

export interface CreateTelegramSenderOptions {
  readonly chatIds: readonly number[];
  readonly transport: TelegramTransport;
}

export interface TickDependencies {
  readonly dbPath: string;
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
  readonly notifyPendingApprovals?: typeof defaultNotifyPendingApprovals;
  readonly now?: () => number;
  readonly sleep?: (delayMs: number) => Promise<void> | void;
  readonly timer?: RuntimeTimer;
  readonly onTickError?: (err: unknown) => void;
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
    },
  };
}

export function createTelegramSender(
  options: CreateTelegramSenderOptions,
): ApprovalNotificationSender {
  const chatIds = [...options.chatIds];
  return async (notification: ApprovalNotification): Promise<void> => {
    await Promise.all(
      chatIds.map((chatId) => options.transport.sendMessage(chatId, notification.text)),
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
  };
}

export function createBotTick(dependencies: TickDependencies): BotTick {
  let running = false;

  return {
    async tick(): Promise<BotTickResult> {
      if (running) {
        return { status: "skipped" };
      }

      running = true;
      const db = dependencies.openDb(dependencies.dbPath);
      try {
        const notifierResult = await dependencies.notifyPendingApprovals({
          db,
          sender: dependencies.sender,
          now: dependencies.now,
          sleep: dependencies.sleep,
        });
        return { status: "ran", notifierResult };
      } finally {
        try {
          db.close();
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
  const transport = options.transport ?? createTelegramHttpTransport({ token: config.token });
  const sender =
    options.sender ??
    createTelegramSender({ chatIds: config.operatorChatIds, transport });
  const tickController = createBotTick({
    dbPath: config.dbPath,
    openDb: options.openDb ?? defaultOpenDb,
    sender,
    notifyPendingApprovals:
      options.notifyPendingApprovals ?? defaultNotifyPendingApprovals,
    now: options.now ?? (() => Math.floor(Date.now() / 1000)),
    sleep: options.sleep ?? ((delayMs) => Bun.sleep(delayMs)),
  });
  const timer = options.timer ?? defaultRuntimeTimer();
  const onTickError =
    options.onTickError ??
    ((err: unknown) => {
      console.error(err);
    });
  const handle = timer.setInterval(() => {
    void tickController.tick().catch(onTickError);
  }, config.tickIntervalMs);

  return {
    config,
    tick: tickController.tick,
    stop(): void {
      timer.clearInterval(handle);
    },
  };
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
