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
