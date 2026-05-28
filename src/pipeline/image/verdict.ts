export interface VerdictCriterion {
  id: string;
  pass: boolean;
  score?: number;
  rationale: string;
}

export interface JudgeVerdict {
  overallPass: boolean;
  criteria: VerdictCriterion[];
  regenerateFeedback?: string;
}

export class JudgeVerdictParseError extends Error {
  readonly code = "JUDGE_VERDICT_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "JudgeVerdictParseError";
  }
}

export function parseJudgeVerdict(json: unknown): JudgeVerdict {
  const verdict = expectRecord(json, "verdict");
  if (typeof verdict.overallPass !== "boolean") {
    throw new JudgeVerdictParseError("overallPass must be boolean");
  }

  const criteria = parseCriteria(verdict.criteria);
  const criteriaPass = criteria.every((criterion) => criterion.pass);
  if (verdict.overallPass !== criteriaPass) {
    throw new JudgeVerdictParseError(
      "overallPass must match criteria pass values",
    );
  }

  if (verdict.regenerateFeedback === undefined) {
    if (!verdict.overallPass) {
      throw new JudgeVerdictParseError(
        "regenerateFeedback is required for failed verdicts",
      );
    }
    return { overallPass: verdict.overallPass, criteria };
  }

  return {
    overallPass: verdict.overallPass,
    criteria,
    regenerateFeedback: parseNonEmptyString(
      verdict.regenerateFeedback,
      "regenerateFeedback",
    ),
  };
}

function expectRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new JudgeVerdictParseError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseCriteria(value: unknown): VerdictCriterion[] {
  if (!Array.isArray(value)) {
    throw new JudgeVerdictParseError("criteria must be an array");
  }
  if (value.length === 0) {
    throw new JudgeVerdictParseError("criteria must not be empty");
  }

  const ids = new Set<string>();
  return value.map((entry, index) => {
    const criterion = expectRecord(entry, `criteria[${index}]`);
    const id = parseNonEmptyString(criterion.id, `criteria[${index}].id`);
    if (ids.has(id)) {
      throw new JudgeVerdictParseError(`duplicate verdict criterion id: ${id}`);
    }
    ids.add(id);

    if (typeof criterion.pass !== "boolean") {
      throw new JudgeVerdictParseError(
        `criteria[${index}].pass must be boolean`,
      );
    }

    const parsed: VerdictCriterion = {
      id,
      pass: criterion.pass,
      rationale: parseNonEmptyString(
        criterion.rationale,
        `criteria[${index}].rationale`,
      ),
    };

    if (criterion.score !== undefined) {
      if (typeof criterion.score !== "number" || !Number.isFinite(criterion.score)) {
        throw new JudgeVerdictParseError(
          `criteria[${index}].score must be finite number`,
        );
      }
      parsed.score = criterion.score;
    }

    return parsed;
  });
}

function parseNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new JudgeVerdictParseError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new JudgeVerdictParseError(`${field} must not be empty`);
  }
  return trimmed;
}
