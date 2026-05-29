import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import type { PublishManifest } from "../promote.ts";

export interface ReadmeImageGalleryJobRow {
  readonly id: string;
  readonly purpose: ReadmeImageGalleryJobPurpose | string | null;
  readonly artifact_dir: string | null;
  readonly created_at: number;
}

export type ReadmeImageGalleryJobPurpose = "production" | "validation";

export interface ReadmeImageGalleryEntry {
  readonly jobId: string;
  readonly created: string;
  readonly prompt: string;
  readonly imagePath: string;
  readonly specPath: string;
  readonly aggregateSha256: string;
}

export interface ReadmeImageGalleryResult {
  readonly status: "published" | "idempotent";
  readonly readmePath: "README.md";
  readonly entries: number;
}

export type ReadmeImageGalleryDestinationErrorCode =
  | "PUBLISH_MANIFEST_INVALID"
  | "PUBLISH_SOURCE_MISSING"
  | "README_DESTINATION_INVALID"
  | "README_PUBLISH_FAILED";

export class ReadmeImageGalleryDestinationError extends Error {
  readonly name = "ReadmeImageGalleryDestinationError";
  readonly code: ReadmeImageGalleryDestinationErrorCode;
  override readonly cause?: unknown;

  constructor(
    code: ReadmeImageGalleryDestinationErrorCode,
    detail?: string,
    cause?: unknown,
  ) {
    super(detail === undefined || detail.length === 0 ? code : `${code}: ${detail}`);
    this.code = code;
    this.cause = cause;
  }
}

const startMarker = "<!-- content-zoe:image-gallery:start -->";
const endMarker = "<!-- content-zoe:image-gallery:end -->";
const exactImageFiles = ["image.png", "request.txt", "spec.json", "verdict.json"] as const;
const safePathPattern = /^[A-Za-z0-9._~/-]+$/;
const lowercaseSha256Pattern = /^[0-9a-f]{64}$/;
const aggregatePrefixPattern = /^[0-9a-f]{12}$/;
const maxPromptCellLength = 120;

export function buildReadmeImageGalleryEntry(input: {
  readonly cwd: string;
  readonly job: ReadmeImageGalleryJobRow;
  readonly manifest: PublishManifest;
}): ReadmeImageGalleryEntry {
  const cwd = realpathSync(input.cwd);
  assertManifestShape(input.job, input.manifest);
  const artifactRoot = validateArtifactRoot(cwd, input.manifest.artifact_dir);
  const sha256 = input.manifest.sha256 as Readonly<Record<string, string>>;
  for (const file of exactImageFiles) {
    assertSourceFile(cwd, artifactRoot, file, sha256[file]);
  }
  const requestPath = path.resolve(artifactRoot, "request.txt");

  return {
    jobId: input.job.id,
    created: formatCreatedAt(input.job.created_at),
    prompt: sanitizePrompt(readFileSync(requestPath, "utf8")),
    imagePath: `${input.manifest.artifact_dir}/image.png`,
    specPath: `${input.manifest.artifact_dir}/spec.json`,
    aggregateSha256: input.manifest.aggregate_sha256,
  };
}

export function publishReadmeImageGallery(input: {
  readonly cwd: string;
  readonly entry: ReadmeImageGalleryEntry;
  readonly purpose: ReadmeImageGalleryJobPurpose;
  readonly readmePath?: string;
  readonly jobPurposes: ReadonlyMap<string, ReadmeImageGalleryJobPurpose | string | null>;
}): ReadmeImageGalleryResult {
  const cwd = realpathSync(input.cwd);
  const readmePath = resolveReadmePath(cwd, input.readmePath);
  assertReadmePathSafe(cwd, readmePath);

  let tempPath: string | undefined;
  try {
    const existing = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
    const { content, entries } = renderReadme(
      existing,
      input.entry,
      input.purpose,
      input.jobPurposes,
    );
    if (content === existing) {
      return { status: "idempotent", readmePath: "README.md", entries };
    }

    tempPath = allocateTempPath(readmePath);
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, readmePath);
    tempPath = undefined;
    return { status: "published", readmePath: "README.md", entries };
  } catch (err) {
    if (tempPath !== undefined) {
      rmSync(tempPath, { force: true });
    }
    if (err instanceof ReadmeImageGalleryDestinationError) throw err;
    throw new ReadmeImageGalleryDestinationError("README_PUBLISH_FAILED", formatThrown(err), err);
  }
}

function assertManifestShape(job: ReadmeImageGalleryJobRow, manifest: PublishManifest): void {
  if (
    manifest.job_id !== job.id ||
    manifest.artifact_dir !== job.artifact_dir ||
    !manifest.artifact_dir.startsWith(`images/${job.id}`)
  ) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "manifest row mismatch");
  }
  if (manifest.artifact_dir !== `images/${job.id}`) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "unexpected image artifact dir");
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify(exactImageFiles)) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "unexpected image file set");
  }
  if (!isSafeRepoRelativePath(manifest.artifact_dir)) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "unsafe artifact_dir");
  }
  const sha256 = manifest.sha256 as unknown;
  if (!isPlainRecord(sha256)) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "invalid sha256 map");
  }

  const digestMap: Record<string, string> = {};
  for (const file of exactImageFiles) {
    const digest = sha256[file];
    if (typeof digest !== "string" || !lowercaseSha256Pattern.test(digest)) {
      throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "invalid sha256 map");
    }
    digestMap[file] = digest;
  }
  if (Object.keys(sha256).sort().join("\n") !== exactImageFiles.join("\n")) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "sha256 map mismatch");
  }
  if (!lowercaseSha256Pattern.test(manifest.aggregate_sha256)) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "invalid aggregate_sha256");
  }
  const expectedAggregate = createHash("sha256")
    .update(JSON.stringify(exactImageFiles.map((file) => [file, digestMap[file]])))
    .digest("hex");
  if (manifest.aggregate_sha256 !== expectedAggregate) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "aggregate mismatch");
  }
}

function validateArtifactRoot(cwd: string, artifactDir: string): string {
  const artifactRoot = path.resolve(cwd, artifactDir);
  if (!isInside(cwd, artifactRoot)) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "artifact_dir escapes cwd");
  }
  return artifactRoot;
}

function assertSourceFile(
  cwd: string,
  artifactRoot: string,
  relativePath: string,
  expectedSha256?: string,
): void {
  if (!isSafeRepoRelativePath(relativePath)) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "unsafe manifest path");
  }
  const absolutePath = path.resolve(artifactRoot, relativePath);
  if (!isInside(cwd, absolutePath) || !isInside(artifactRoot, absolutePath)) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "manifest path escapes root");
  }
  if (expectedSha256 === undefined) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "missing sha256");
  }
  try {
    const actualSha256 = createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
    if (actualSha256 !== expectedSha256) {
      throw new ReadmeImageGalleryDestinationError(
        "PUBLISH_MANIFEST_INVALID",
        "source path hash mismatch",
      );
    }
  } catch (err) {
    if (err instanceof ReadmeImageGalleryDestinationError) throw err;
    throw new ReadmeImageGalleryDestinationError("PUBLISH_SOURCE_MISSING", "source path missing", err);
  }
}

function renderReadme(
  existing: string,
  entry: ReadmeImageGalleryEntry,
  purpose: ReadmeImageGalleryJobPurpose,
  jobPurposes: ReadonlyMap<string, ReadmeImageGalleryJobPurpose | string | null>,
): { content: string; entries: number } {
  const rows = parseExistingRows(existing, jobPurposes);
  if (purpose === "production") {
    rows.set(entry.jobId, entry);
  } else {
    rows.delete(entry.jobId);
  }
  const table = renderTable([...rows.values()]);
  const section = `${startMarker}\n${table}${endMarker}\n`;
  const markerState = markerPositions(existing);
  if (markerState.kind === "missing") {
    const prefix = ensureTrailingNewline(existing);
    const spacer = prefix.trim().length === 0 ? "" : "\n";
    return {
      content: `${prefix}${spacer}## Image Gallery\n\n${section}`,
      entries: rows.size,
    };
  }
  const { start, end } = markerState;
  return {
    content: `${existing.slice(0, start)}${section}${existing.slice(end + endMarker.length + markerState.endTrailingNewline)}`,
    entries: rows.size,
  };
}

function parseExistingRows(
  existing: string,
  jobPurposes: ReadonlyMap<string, ReadmeImageGalleryJobPurpose | string | null>,
): Map<string, ReadmeImageGalleryEntry> {
  const markerState = markerPositions(existing);
  const rows = new Map<string, ReadmeImageGalleryEntry>();
  if (markerState.kind === "missing") return rows;

  const section = existing.slice(markerState.start + startMarker.length, markerState.end);
  for (const rawLine of section.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line === "| Created | Prompt | Image | Spec | Aggregate |") continue;
    if (line === "|---|---|---|---|---|") continue;
    const parsed = parseManagedRow(line);
    const purpose = jobPurposes.get(parsed.jobId);
    if (purpose !== "production" && purpose !== "validation") {
      throw new ReadmeImageGalleryDestinationError(
        "README_DESTINATION_INVALID",
        `invalid purpose for image gallery row: ${parsed.jobId}`,
      );
    }
    if (purpose === "production") rows.set(parsed.jobId, parsed);
  }
  return rows;
}

function parseManagedRow(line: string): ReadmeImageGalleryEntry {
  if (!line.startsWith("|") || !line.endsWith("|")) {
    throw new ReadmeImageGalleryDestinationError("README_DESTINATION_INVALID", "malformed gallery row");
  }
  const cells = splitMarkdownRow(line);
  if (cells.length !== 5) {
    throw new ReadmeImageGalleryDestinationError("README_DESTINATION_INVALID", "malformed gallery row");
  }
  const imagePath = parseExactLink(cells[2], "image");
  const specPath = parseExactLink(cells[3], "spec");
  const match = /^images\/([A-Za-z0-9._~-]+)\/image\.png$/.exec(imagePath);
  if (match === null || specPath !== `images/${match[1]}/spec.json`) {
    throw new ReadmeImageGalleryDestinationError("README_DESTINATION_INVALID", "inconsistent gallery links");
  }
  if (!textCellIsSafe(cells[0])) {
    throw new ReadmeImageGalleryDestinationError("README_DESTINATION_INVALID", "unsafe created cell");
  }
  const aggregate = cells[4].trim().toLowerCase();
  if (!aggregatePrefixPattern.test(aggregate)) {
    throw new ReadmeImageGalleryDestinationError("README_DESTINATION_INVALID", "invalid aggregate cell");
  }
  return {
    jobId: match[1],
    created: sanitizeText(cells[0]),
    prompt: sanitizeText(cells[1]),
    imagePath,
    specPath,
    aggregateSha256: aggregate.padEnd(64, "0"),
  };
}

function splitMarkdownRow(row: string): string[] {
  const body = row.slice(1, -1);
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "|" && body[index - 1] !== "\\") {
      cells.push(unescapeCell(current.trim()));
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(unescapeCell(current.trim()));
  return cells;
}

function parseExactLink(cell: string, label: "image" | "spec"): string {
  const match = new RegExp(`^\\[${label}\\]\\(([A-Za-z0-9._~/-]+)\\)$`).exec(cell.trim());
  if (match === null) {
    throw new ReadmeImageGalleryDestinationError("README_DESTINATION_INVALID", "invalid gallery link");
  }
  const linkPath = match[1];
  if (!isSafeRepoRelativePath(linkPath)) {
    throw new ReadmeImageGalleryDestinationError("README_DESTINATION_INVALID", "unsafe gallery link");
  }
  return linkPath;
}

function renderTable(rows: readonly ReadmeImageGalleryEntry[]): string {
  const ordered = [...rows].sort((a, b) => {
    const created = b.created.localeCompare(a.created);
    if (created !== 0) return created;
    return b.jobId.localeCompare(a.jobId);
  });
  const lines = [
    "| Created | Prompt | Image | Spec | Aggregate |",
    "|---|---|---|---|---|",
    ...ordered.map((row) =>
      `| ${[
        markdownText(row.created),
        markdownText(row.prompt),
        renderLinkCell("image", row.imagePath),
        renderLinkCell("spec", row.specPath),
        row.aggregateSha256.slice(0, 12).toLowerCase(),
      ].join(" | ")} |`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function renderLinkCell(label: "image" | "spec", value: string): string {
  if (!isSafeRepoRelativePath(value)) {
    throw new ReadmeImageGalleryDestinationError("PUBLISH_MANIFEST_INVALID", "unsafe README link");
  }
  return `[${label}](${value})`;
}

function markerPositions(existing: string):
  | { readonly kind: "missing" }
  | {
      readonly kind: "present";
      readonly start: number;
      readonly end: number;
      readonly endTrailingNewline: number;
    } {
  const startCount = countOccurrences(existing, startMarker);
  const endCount = countOccurrences(existing, endMarker);
  if (startCount === 0 && endCount === 0) return { kind: "missing" };
  if (startCount !== 1 || endCount !== 1) {
    throw new ReadmeImageGalleryDestinationError("README_DESTINATION_INVALID", "duplicate or missing markers");
  }
  const start = existing.indexOf(startMarker);
  const end = existing.indexOf(endMarker);
  if (end < start) {
    throw new ReadmeImageGalleryDestinationError("README_DESTINATION_INVALID", "reversed markers");
  }
  const newlineIndex = end + endMarker.length;
  return {
    kind: "present",
    start,
    end,
    endTrailingNewline: existing[newlineIndex] === "\n" ? 1 : 0,
  };
}

function resolveReadmePath(cwd: string, readmePath = "README.md"): string {
  if (path.isAbsolute(readmePath)) {
    throw new ReadmeImageGalleryDestinationError("README_DESTINATION_INVALID", "absolute README path");
  }
  return path.resolve(cwd, readmePath);
}

function assertReadmePathSafe(cwd: string, readmePath: string): void {
  if (!isInside(cwd, readmePath) || path.basename(readmePath) !== "README.md") {
    throw new ReadmeImageGalleryDestinationError("README_DESTINATION_INVALID", "unsafe README path");
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeRepoRelativePath(value: string): boolean {
  if (
    value.length === 0 ||
    path.posix.isAbsolute(value) ||
    value.includes("\\") ||
    value.includes("://") ||
    /[\r\n\t]/.test(value) ||
    !safePathPattern.test(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  return !segments.some((segment) => segment.length === 0 || segment === "." || segment === "..");
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sanitizePrompt(value: string): string {
  const text = sanitizeText(value);
  if (text.length <= maxPromptCellLength) return text;
  return `${text.slice(0, maxPromptCellLength - 3)}...`;
}

function markdownText(value: string): string {
  return sanitizeText(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function sanitizeText(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function textCellIsSafe(value: string): boolean {
  return !/[\r\n\t]/.test(value);
}

function unescapeCell(value: string): string {
  return value
    .replaceAll("\\|", "|")
    .replaceAll("\\[", "[")
    .replaceAll("\\]", "]")
    .replaceAll("\\(", "(")
    .replaceAll("\\)", ")")
    .replaceAll("\\\\", "\\");
}

function formatCreatedAt(value: number): string {
  if (!Number.isFinite(value)) {
    throw new ReadmeImageGalleryDestinationError("README_DESTINATION_INVALID", "invalid created_at");
  }
  return new Date(value * 1000).toISOString();
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function allocateTempPath(readmePath: string): string {
  return path.resolve(
    path.dirname(readmePath),
    `.README.md.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
