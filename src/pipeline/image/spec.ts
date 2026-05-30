export interface AcceptanceCriterion {
  id: string;
  description: string;
  tier: "mechanical" | "judged";
}

export interface ImageSpec {
  promptOriginal: string;
  subject: string;
  style: string;
  composition: string;
  palette: string[];
  dimensions: { w: number; h: number };
  negativeConstraints: string[];
  safetyProfile: string;
  acceptanceCriteria: AcceptanceCriterion[];
}

export class ImageSpecParseError extends Error {
  readonly code = "IMAGE_SPEC_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "ImageSpecParseError";
  }
}

const supportedDimensions = new Set(["1024x1024", "1536x1024", "1024x1536"]);

export function parseImageSpec(json: unknown): ImageSpec {
  const spec = expectRecord(json, "spec");
  const dimensions = parseDimensions(spec.dimensions);
  const acceptanceCriteria = parseAcceptanceCriteria(spec.acceptanceCriteria);

  return {
    promptOriginal: parseNonEmptyString(spec.promptOriginal, "promptOriginal"),
    subject: parseNonEmptyString(spec.subject, "subject"),
    style: parseNonEmptyString(spec.style, "style"),
    composition: parseNonEmptyString(spec.composition, "composition"),
    palette: parseStringArray(spec.palette, "palette"),
    dimensions,
    negativeConstraints: parseStringArray(
      spec.negativeConstraints,
      "negativeConstraints",
    ),
    safetyProfile: parseNonEmptyString(spec.safetyProfile, "safetyProfile"),
    acceptanceCriteria,
  };
}

export function normalizeImageSpecDraft(json: unknown): ImageSpec {
  const spec = expectRecord(json, "spec");
  return parseImageSpec({
    ...spec,
    subject: normalizeStringField(spec.subject, "subject"),
    style: normalizeStringField(spec.style, "style"),
    composition: normalizeStringField(spec.composition, "composition"),
    palette: normalizePalette(spec.palette),
    negativeConstraints: normalizeStringArrayField(
      spec.negativeConstraints,
      "negativeConstraints",
    ),
    safetyProfile: normalizeStringField(spec.safetyProfile, "safetyProfile"),
  });
}

function expectRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ImageSpecParseError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ImageSpecParseError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ImageSpecParseError(`${field} must not be empty`);
  }
  return trimmed;
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new ImageSpecParseError(`${field} must be an array`);
  }
  return value.map((entry, index) =>
    parseNonEmptyString(entry, `${field}[${index}]`),
  );
}

function normalizeStringField(value: unknown, field: string): string {
  if (typeof value === "string") return value;
  const normalized = stringifyDraftValue(value);
  if (normalized.length === 0) {
    throw new ImageSpecParseError(`${field} could not be normalized to a string`);
  }
  return normalized;
}

function normalizePalette(value: unknown): string[] {
  return normalizeStringArrayField(value, "palette");
}

function normalizeStringArrayField(value: unknown, field: string): string[] {
  if (Array.isArray(value)) return value as string[];
  const entries = collectDraftStrings(value);
  if (entries.length === 0) {
    throw new ImageSpecParseError(`${field} could not be normalized to an array`);
  }
  return entries;
}

function stringifyDraftValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map(stringifyDraftValue)
      .filter(Boolean)
      .join("; ");
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        const normalized = stringifyDraftValue(entry);
        return normalized.length > 0 ? `${key}: ${normalized}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return "";
}

function collectDraftStrings(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectDraftStrings);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>).flatMap(
      collectDraftStrings,
    );
  }
  return [];
}

function parseDimensions(value: unknown): { w: number; h: number } {
  const dimensions = expectRecord(value, "dimensions");
  const w = parsePositiveInteger(dimensions.w, "dimensions.w");
  const h = parsePositiveInteger(dimensions.h, "dimensions.h");
  const preset = `${w}x${h}`;
  if (!supportedDimensions.has(preset)) {
    throw new ImageSpecParseError(
      `dimensions must be one of ${[...supportedDimensions].join(", ")}`,
    );
  }
  return { w, h };
}

function parsePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ImageSpecParseError(`${field} must be a finite number`);
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new ImageSpecParseError(`${field} must be a positive integer`);
  }
  return value;
}

function parseAcceptanceCriteria(value: unknown): AcceptanceCriterion[] {
  if (!Array.isArray(value)) {
    throw new ImageSpecParseError("acceptanceCriteria must be an array");
  }
  if (value.length === 0) {
    throw new ImageSpecParseError("acceptanceCriteria must not be empty");
  }

  const ids = new Set<string>();
  return value.map((entry, index) => {
    const criterion = expectRecord(entry, `acceptanceCriteria[${index}]`);
    const id = parseNonEmptyString(
      criterion.id,
      `acceptanceCriteria[${index}].id`,
    );
    if (ids.has(id)) {
      throw new ImageSpecParseError(`duplicate acceptance criterion id: ${id}`);
    }
    ids.add(id);

    const tier = criterion.tier;
    if (tier !== "mechanical" && tier !== "judged") {
      throw new ImageSpecParseError(
        `acceptanceCriteria[${index}].tier must be mechanical or judged`,
      );
    }

    return {
      id,
      description: parseNonEmptyString(
        criterion.description,
        `acceptanceCriteria[${index}].description`,
      ),
      tier,
    };
  });
}
