export interface OperatorAllowlist {
  readonly chatIds: readonly number[];
  isAllowedChat(chatId: number): boolean;
}

export interface ParseOperatorChatIdsResult extends OperatorAllowlist {
  readonly valid: boolean;
}

const integerPattern = /^-?\d+$/;

export function parseOperatorChatIds(
  raw: string | null | undefined,
): ParseOperatorChatIdsResult {
  if (raw === undefined || raw === null) {
    return closedAllowlist();
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return closedAllowlist();
  }

  const parts = trimmed.split(",");
  const seen = new Set<number>();
  const chatIds: number[] = [];

  for (const part of parts) {
    const token = part.trim();
    if (!integerPattern.test(token)) {
      return closedAllowlist();
    }

    const chatId = Number(token);
    if (!Number.isSafeInteger(chatId)) {
      return closedAllowlist();
    }

    if (!seen.has(chatId)) {
      seen.add(chatId);
      chatIds.push(chatId);
    }
  }

  if (chatIds.length === 0) {
    return closedAllowlist();
  }

  return makeAllowlist(chatIds, true);
}

export function isAllowedChat(
  allowlist: OperatorAllowlist,
  chatId: number,
): boolean {
  return allowlist.isAllowedChat(chatId);
}

function closedAllowlist(): ParseOperatorChatIdsResult {
  return makeAllowlist([], false);
}

function makeAllowlist(
  chatIds: readonly number[],
  valid: boolean,
): ParseOperatorChatIdsResult {
  const allowed = new Set(chatIds);
  return {
    valid,
    chatIds: [...chatIds],
    isAllowedChat(chatId: number): boolean {
      return allowed.has(chatId);
    },
  };
}
