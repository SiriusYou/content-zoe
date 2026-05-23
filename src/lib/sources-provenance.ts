export interface SourcesProvenanceValidationResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly cause?: unknown;
}

const pathFields = ["localPath", "sourceMaterialPath", "source_material_path"] as const;

export function validateSourcesProvenanceText(
  text: string,
  label = "sources.json",
): SourcesProvenanceValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      message: `${label} is not parseable JSON`,
      cause: err,
    };
  }
  return validateSourcesProvenance(parsed, label);
}

export function validateSourcesProvenance(
  parsed: unknown,
  label = "sources.json",
): SourcesProvenanceValidationResult {
  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      message: `${label} root must be a JSON array`,
    };
  }

  for (const [index, entry] of parsed.entries()) {
    const result = validateEntry(entry, index, label);
    if (!result.ok) return result;
  }

  return { ok: true };
}

function validateEntry(
  entry: unknown,
  index: number,
  label: string,
): SourcesProvenanceValidationResult {
  if (!isPlainRecord(entry)) {
    return {
      ok: false,
      message: `${label} entry[${index}] must be an object`,
    };
  }

  let recognizedPathCount = 0;

  for (const field of pathFields) {
    if (!(field in entry)) continue;
    const value = entry[field];
    if (typeof value !== "string") {
      return {
        ok: false,
        message: `${label} entry[${index}].${field} must be a string source-material path`,
      };
    }
    const result = validateSourceMaterialPath(value, `${label} entry[${index}].${field}`);
    if (!result.ok) return result;
    recognizedPathCount++;
  }

  if ("basis" in entry) {
    const value = entry.basis;
    if (!Array.isArray(value)) {
      return {
        ok: false,
        message: `${label} entry[${index}].basis must be an array of source-material paths`,
      };
    }
    for (const [basisIndex, basisPath] of value.entries()) {
      if (typeof basisPath !== "string") {
        return {
          ok: false,
          message: `${label} entry[${index}].basis[${basisIndex}] must be a string source-material path`,
        };
      }
      const result = validateSourceMaterialPath(
        basisPath,
        `${label} entry[${index}].basis[${basisIndex}]`,
      );
      if (!result.ok) return result;
      recognizedPathCount++;
    }
  }

  if (recognizedPathCount > 0) return { ok: true };
  if (isExplicitAssumption(entry)) return { ok: true };

  return {
    ok: false,
    message: `${label} entry[${index}] has no recognized source-material path and is not an explicit assumption`,
  };
}

function validateSourceMaterialPath(
  value: string,
  fieldLabel: string,
): SourcesProvenanceValidationResult {
  if (value.length === 0) {
    return {
      ok: false,
      message: `${fieldLabel} must not be empty`,
    };
  }
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value === "source-material" ||
    !value.startsWith("source-material/")
  ) {
    return {
      ok: false,
      message: `${fieldLabel} must be under source-material/: ${value}`,
    };
  }

  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return {
      ok: false,
      message: `${fieldLabel} must be a normalized source-material path: ${value}`,
    };
  }

  return { ok: true };
}

function isExplicitAssumption(entry: Record<string, unknown>): boolean {
  return (
    entry.kind === "assumption" ||
    (typeof entry.id === "string" && entry.id.startsWith("assumption"))
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
