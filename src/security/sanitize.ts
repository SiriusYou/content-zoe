export interface SanitizedTopic {
  readonly raw: string;
  readonly value: string;
  readonly changed: boolean;
}

export class TopicSanitizationError extends Error {
  readonly name = "TopicSanitizationError";
  readonly code = "INVALID_TOPIC";

  constructor(message: string) {
    super(message);
  }
}

const maxTopicChars = 160;

export function sanitizeTopic(raw: string): SanitizedTopic {
  let value = raw.replace(/[\r\n\t]/g, " ").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  value = value.trim();
  value = value.replaceAll("<<<", "").replaceAll(">>>", "");
  value = value.replace(/[`$;&|<>]/g, "");
  value = value.replace(/ignore\s+all\s+previous\s+instructions/gi, "");
  value = value.replace(/ignore\s+previous\s+instructions/gi, "");
  value = value.replace(/system\s+prompt/gi, "");
  value = value.replace(/developer\s+message/gi, "");
  value = value.replace(/\s+/g, " ").trim();

  if (value.length === 0) {
    throw new TopicSanitizationError("INVALID_TOPIC: empty");
  }
  if (value.length > maxTopicChars) {
    throw new TopicSanitizationError("INVALID_TOPIC: too_long");
  }

  return {
    raw,
    value,
    changed: value !== raw,
  };
}
