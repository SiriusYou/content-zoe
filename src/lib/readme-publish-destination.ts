import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import type { PublishManifest } from "../promote.ts";

export interface ReadmePublishJobRow {
  readonly id: string;
  readonly week_key: string;
  readonly topic: string;
  readonly attempt_number: number;
  readonly status: string;
  readonly purpose: ReadmePublishJobPurpose | string | null;
  readonly artifact_dir: string | null;
  readonly primary_report_path: string | null;
  readonly translated_report_path: string | null;
  readonly sources_path: string | null;
  readonly approval_summary: string | null;
  readonly updated_at: number;
}

export type ReadmePublishJobPurpose = "production" | "validation";

export interface ReadmePublishEntry {
  readonly weekKey: string;
  readonly topic: string;
  readonly jobId: string;
  readonly reportPath: string;
  readonly sourcesPath: string;
  readonly sourceMaterialPath: string;
  readonly aggregateSha256: string;
  readonly updatedAt: string;
}

export interface ReadmePublishResult {
  readonly status: "published" | "idempotent";
  readonly readmePath: "README.md";
  readonly reportPath: string;
  readonly sourcesPath: string;
  readonly aggregateSha256: string;
  readonly entries: number;
}

export type ReadmePublishDestinationErrorCode =
  | "PUBLISH_MANIFEST_INVALID"
  | "PUBLISH_SOURCE_MISSING"
  | "README_DESTINATION_INVALID"
  | "README_PUBLISH_FAILED";

export class ReadmePublishDestinationError extends Error {
  readonly name = "ReadmePublishDestinationError";
  readonly code: ReadmePublishDestinationErrorCode;
  override readonly cause?: unknown;

  constructor(code: ReadmePublishDestinationErrorCode, detail?: string, cause?: unknown) {
    super(detail === undefined || detail.length === 0 ? code : `${code}: ${detail}`);
    this.code = code;
    this.cause = cause;
  }
}

const startMarker = "<!-- content-zoe:published-reports:start -->";
const endMarker = "<!-- content-zoe:published-reports:end -->";
const safePathPattern = /^[A-Za-z0-9._~/-]+$/;
const lowercaseSha256Pattern = /^[0-9a-f]{64}$/;
const aggregatePrefixPattern = /^[0-9a-f]{12}$/;
const sourceMaterialManifestPath = "source-material/manifest.json";

export function buildReadmePublishEntry(input: {
  readonly cwd: string;
  readonly job: ReadmePublishJobRow;
  readonly manifest: PublishManifest;
}): ReadmePublishEntry {
  const cwd = realpathSync(input.cwd);
  assertManifestShape(input.job, input.manifest);
  const artifactRoot = validateArtifactRoot(cwd, input.manifest.artifact_dir);
  const sha256 = input.manifest.sha256 as Readonly<Record<string, string>>;
  for (const file of input.manifest.files) {
    assertSourceFile(cwd, artifactRoot, file, sha256[file]);
  }
  const sourceMaterialPath = selectSourceMaterialManifestPath(input.manifest);

  return {
    weekKey: sanitizeText(input.job.week_key),
    topic: input.job.topic,
    jobId: input.job.id,
    reportPath: selectManifestBackedPath({
      cwd,
      artifactRoot,
      artifactDir: input.manifest.artifact_dir,
      files: input.manifest.files,
      jobId: input.job.id,
      attemptNumber: input.job.attempt_number,
      primary: input.job.primary_report_path,
      translated: input.job.translated_report_path,
      fieldName: "report",
    }),
    sourcesPath: selectManifestBackedPath({
      cwd,
      artifactRoot,
      artifactDir: input.manifest.artifact_dir,
      files: input.manifest.files,
      jobId: input.job.id,
      attemptNumber: input.job.attempt_number,
      primary: input.job.sources_path,
      translated: null,
      fieldName: "sources",
    }),
    sourceMaterialPath,
    aggregateSha256: input.manifest.aggregate_sha256,
    updatedAt: formatUpdatedAt(input.job.updated_at),
  };
}

export function publishReadmeDestination(input: {
  readonly cwd: string;
  readonly entry: ReadmePublishEntry;
  readonly readmePath?: string;
  readonly jobPurposes?: ReadonlyMap<string, ReadmePublishJobPurpose | string | null>;
}): ReadmePublishResult {
  const cwd = realpathSync(input.cwd);
  const readmePath = resolveReadmePath(cwd, input.readmePath);
  assertReadmePathSafe(cwd, readmePath);

  let tempPath: string | undefined;
  try {
    const existing = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
    const { content, entries } = renderReadme(existing, input.entry, input.jobPurposes);
    if (content === existing) {
      return {
        status: "idempotent",
        readmePath: "README.md",
        reportPath: input.entry.reportPath,
        sourcesPath: input.entry.sourcesPath,
        aggregateSha256: input.entry.aggregateSha256,
        entries,
      };
    }

    tempPath = allocateTempPath(readmePath);
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, readmePath);
    tempPath = undefined;
    return {
      status: "published",
      readmePath: "README.md",
      reportPath: input.entry.reportPath,
      sourcesPath: input.entry.sourcesPath,
      aggregateSha256: input.entry.aggregateSha256,
      entries,
    };
  } catch (err) {
    if (tempPath !== undefined) {
      rmSync(tempPath, { force: true });
    }
    if (err instanceof ReadmePublishDestinationError) throw err;
    throw new ReadmePublishDestinationError("README_PUBLISH_FAILED", formatThrown(err), err);
  }
}

function assertManifestShape(job: ReadmePublishJobRow, manifest: PublishManifest): void {
  if (
    manifest.job_id !== job.id ||
    manifest.attempt_number !== job.attempt_number ||
    manifest.artifact_dir !== job.artifact_dir
  ) {
    throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "manifest row mismatch");
  }
  if (!isSafeRepoRelativePath(manifest.artifact_dir)) {
    throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "unsafe artifact_dir");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "manifest files missing");
  }
  const files: string[] = [];
  for (const file of manifest.files as readonly unknown[]) {
    if (typeof file !== "string") {
      throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "manifest files invalid");
    }
    files.push(file);
  }
  const sha256 = manifest.sha256 as unknown;
  if (!isPlainRecord(sha256)) {
    throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "invalid sha256 map");
  }
  const digestMap: Record<string, string> = {};
  const sorted = [...files].sort();
  if (JSON.stringify(files) !== JSON.stringify(sorted) || new Set(files).size !== files.length) {
    throw new ReadmePublishDestinationError(
      "PUBLISH_MANIFEST_INVALID",
      "manifest files must be sorted and unique",
    );
  }
  for (const file of files) {
    if (!isSafeManifestRelativePath(file)) {
      throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "unsafe manifest path");
    }
    const digest = sha256[file];
    if (typeof digest !== "string" || !lowercaseSha256Pattern.test(digest)) {
      throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "invalid sha256 map");
    }
    digestMap[file] = digest;
  }
  if (Object.keys(sha256).sort().join("\n") !== files.join("\n")) {
    throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "sha256 map mismatch");
  }
  if (!lowercaseSha256Pattern.test(manifest.aggregate_sha256)) {
    throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "invalid aggregate_sha256");
  }
  const expectedAggregate = createHash("sha256")
    .update(JSON.stringify(files.map((file) => [file, digestMap[file]])))
    .digest("hex");
  if (manifest.aggregate_sha256 !== expectedAggregate) {
    throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "aggregate mismatch");
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateArtifactRoot(cwd: string, artifactDir: string): string {
  const artifactRoot = path.resolve(cwd, artifactDir);
  if (!isInside(cwd, artifactRoot)) {
    throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "artifact_dir escapes cwd");
  }
  try {
    assertNoSymlinkComponents(cwd, artifactRoot, "artifact_dir");
    const stat = lstatSync(artifactRoot);
    if (!stat.isDirectory()) {
      throw new ReadmePublishDestinationError(
        "PUBLISH_SOURCE_MISSING",
        "artifact_dir is not a directory",
      );
    }
  } catch (err) {
    if (err instanceof ReadmePublishDestinationError) throw err;
    throw new ReadmePublishDestinationError("PUBLISH_SOURCE_MISSING", "artifact_dir missing", err);
  }
  return artifactRoot;
}

function assertSourceFile(
  cwd: string,
  artifactRoot: string,
  relativePath: string,
  expectedSha256?: string,
): string {
  if (!isSafeManifestRelativePath(relativePath)) {
    throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "unsafe manifest path");
  }
  const absolutePath = path.resolve(artifactRoot, relativePath);
  if (!isInside(cwd, absolutePath) || !isInside(artifactRoot, absolutePath)) {
    throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "manifest path escapes root");
  }
  assertNoSymlinkComponents(artifactRoot, absolutePath, "manifest path");
  try {
    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "source path is symlink");
    }
    if (!stat.isFile()) {
      throw new ReadmePublishDestinationError("PUBLISH_SOURCE_MISSING", "source path is not a file");
    }
    if (expectedSha256 !== undefined) {
      const actualSha256 = createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
      if (actualSha256 !== expectedSha256) {
        throw new ReadmePublishDestinationError(
          "PUBLISH_MANIFEST_INVALID",
          "source path hash mismatch",
        );
      }
    }
  } catch (err) {
    if (err instanceof ReadmePublishDestinationError) throw err;
    throw new ReadmePublishDestinationError("PUBLISH_SOURCE_MISSING", "source path missing", err);
  }
  return absolutePath;
}

function selectSourceMaterialManifestPath(manifest: PublishManifest): string {
  const hasSourceMaterialFiles = manifest.files.some(
    (file) => file === sourceMaterialManifestPath || file.startsWith("source-material/"),
  );
  if (!hasSourceMaterialFiles) {
    return "-";
  }
  if (!manifest.files.includes(sourceMaterialManifestPath)) {
    throw new ReadmePublishDestinationError(
      "PUBLISH_MANIFEST_INVALID",
      "source-material manifest missing from promoted manifest",
    );
  }
  return `${manifest.artifact_dir}/${sourceMaterialManifestPath}`;
}

function selectManifestBackedPath(input: {
  readonly cwd: string;
  readonly artifactRoot: string;
  readonly artifactDir: string;
  readonly files: readonly string[];
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly primary: string | null;
  readonly translated: string | null;
  readonly fieldName: string;
}): string {
  const selected = input.translated?.trim() || input.primary?.trim() || "";
  if (selected.length === 0) return "-";
  if (!isSafeRepoRelativePath(selected)) {
    throw new ReadmePublishDestinationError(
      "PUBLISH_MANIFEST_INVALID",
      `${input.fieldName} path is unsafe`,
    );
  }
  const manifestRelative = manifestRelativePathFromHint({
    artifactDir: input.artifactDir,
    attemptNumber: input.attemptNumber,
    fieldName: input.fieldName,
    jobId: input.jobId,
    selected,
  });
  if (!isSafeManifestRelativePath(manifestRelative)) {
    throw new ReadmePublishDestinationError(
      "PUBLISH_MANIFEST_INVALID",
      `${input.fieldName} path is unsafe`,
    );
  }
  if (!input.files.includes(manifestRelative)) {
    throw new ReadmePublishDestinationError(
      "PUBLISH_MANIFEST_INVALID",
      `${input.fieldName} path is not in manifest`,
    );
  }
  assertSourceFile(input.cwd, input.artifactRoot, manifestRelative);
  return `${input.artifactDir}/${manifestRelative}`;
}

function manifestRelativePathFromHint(input: {
  readonly artifactDir: string;
  readonly attemptNumber: number;
  readonly fieldName: string;
  readonly jobId: string;
  readonly selected: string;
}): string {
  if (isInsidePosix(input.artifactDir, input.selected)) {
    return path.posix.relative(input.artifactDir, input.selected);
  }

  const attemptRoot = canonicalAttemptRoot(input.jobId, input.attemptNumber);
  if (attemptRoot !== null && isInsidePosix(attemptRoot, input.selected)) {
    return path.posix.relative(attemptRoot, input.selected);
  }

  throw new ReadmePublishDestinationError(
    "PUBLISH_MANIFEST_INVALID",
    `${input.fieldName} path is outside artifact_dir or attempt root`,
  );
}

function canonicalAttemptRoot(jobId: string, attemptNumber: number): string | null {
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) return null;
  const attemptRoot = `.runs/${jobId}/attempt-${attemptNumber}`;
  return isSafeRepoRelativePath(attemptRoot) ? attemptRoot : null;
}

function resolveReadmePath(cwd: string, readmePath: string | undefined): string {
  if (readmePath === undefined) return path.resolve(cwd, "README.md");
  if (readmePath.trim().length === 0 || /[\r\n\t]/.test(readmePath)) {
    throw new ReadmePublishDestinationError("README_DESTINATION_INVALID", "invalid README path");
  }
  return path.resolve(cwd, readmePath);
}

function assertReadmePathSafe(cwd: string, readmePath: string): void {
  if (!isInside(cwd, readmePath)) {
    throw new ReadmePublishDestinationError("README_DESTINATION_INVALID", "README path escapes cwd");
  }
  assertReadmeParentSafe(cwd, readmePath);
  if (!existsSync(readmePath)) return;
  const stat = lstatSync(readmePath);
  if (stat.isSymbolicLink()) {
    throw new ReadmePublishDestinationError("README_DESTINATION_INVALID", "README is a symlink");
  }
  if (!stat.isFile()) {
    throw new ReadmePublishDestinationError("README_DESTINATION_INVALID", "README is not a file");
  }
}

function assertReadmeParentSafe(cwd: string, readmePath: string): void {
  const relative = path.relative(cwd, path.dirname(readmePath));
  if (relative === "") return;
  let current = cwd;
  for (const part of relative.split(path.sep)) {
    if (part.length === 0) continue;
    current = path.resolve(current, part);
    if (!existsSync(current)) {
      throw new ReadmePublishDestinationError("README_DESTINATION_INVALID", "README parent missing");
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      const real = realpathSync(current);
      if (!isInside(cwd, real)) {
        throw new ReadmePublishDestinationError(
          "README_DESTINATION_INVALID",
          "README parent symlink escapes cwd",
        );
      }
      continue;
    }
    if (!stat.isDirectory()) {
      throw new ReadmePublishDestinationError(
        "README_DESTINATION_INVALID",
        "README parent is not a directory",
      );
    }
  }
}

function renderReadme(
  existing: string,
  currentEntry: ReadmePublishEntry,
  jobPurposes?: ReadonlyMap<string, ReadmePublishJobPurpose | string | null>,
): { readonly content: string; readonly entries: number } {
  const startCount = countOccurrences(existing, startMarker);
  const endCount = countOccurrences(existing, endMarker);
  const rows = existingRows(existing);
  reconcileExistingRows(rows, jobPurposes);
  rows.set(currentEntry.jobId, currentEntry);
  const table = renderTable([...rows.values()]);

  if (startCount === 0 && endCount === 0) {
    const prefix = existing.length === 0 ? "" : `${ensureTrailingNewline(existing)}\n`;
    return {
      content: ensureTrailingNewline(`${prefix}## Published Reports\n\n${startMarker}\n${table}${endMarker}`),
      entries: rows.size,
    };
  }

  if (startCount !== 1 || endCount !== 1) {
    throw new ReadmePublishDestinationError("README_DESTINATION_INVALID", "duplicate or missing markers");
  }

  const start = existing.indexOf(startMarker);
  const end = existing.indexOf(endMarker);
  if (end < start) {
    throw new ReadmePublishDestinationError("README_DESTINATION_INVALID", "markers reversed");
  }

  const before = existing.slice(0, start);
  const after = existing.slice(end + endMarker.length);
  return {
    content: ensureTrailingNewline(`${before}${startMarker}\n${table}${endMarker}${after}`),
    entries: rows.size,
  };
}

function reconcileExistingRows(
  rows: Map<string, ReadmePublishEntry>,
  jobPurposes: ReadonlyMap<string, ReadmePublishJobPurpose | string | null> | undefined,
): void {
  if (jobPurposes === undefined) return;

  for (const jobId of rows.keys()) {
    if (!jobPurposes.has(jobId)) {
      throw new ReadmePublishDestinationError(
        "README_DESTINATION_INVALID",
        `managed row has no jobs row: ${jobId}`,
      );
    }

    const purpose = jobPurposes.get(jobId);
    if (purpose === "production") continue;
    if (purpose === "validation") {
      rows.delete(jobId);
      continue;
    }
    if (purpose === null) {
      throw new ReadmePublishDestinationError(
        "README_DESTINATION_INVALID",
        `managed row has NULL purpose: ${jobId}`,
      );
    }
    throw new ReadmePublishDestinationError(
      "README_DESTINATION_INVALID",
      `managed row has invalid purpose: ${jobId}`,
    );
  }
}

function existingRows(existing: string): Map<string, ReadmePublishEntry> {
  const rows = new Map<string, ReadmePublishEntry>();
  if (countOccurrences(existing, startMarker) !== 1 || countOccurrences(existing, endMarker) !== 1) {
    return rows;
  }
  const start = existing.indexOf(startMarker);
  const end = existing.indexOf(endMarker);
  if (end < start) return rows;
  const section = existing.slice(start + startMarker.length, end);
  for (const line of section.split("\n")) {
    const parsed = parseManagedRow(line);
    if (parsed !== null) rows.set(parsed.jobId, parsed);
  }
  return rows;
}

function parseManagedRow(line: string): ReadmePublishEntry | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  const cells = splitMarkdownRow(trimmed);
  if (cells.length !== 7 && cells.length !== 8) return null;
  if (cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))) return null;
  if (cells[0] === "Week" && cells[1] === "Topic") return null;
  if (!isFormatValidJobId(cells[2])) return null;
  if (!textCellIsSafe(cells[0]) || !textCellIsSafe(cells[1]) || !textCellIsSafe(cells[2])) {
    return null;
  }
  const reportPath = parseLinkCell(cells[3]);
  const sourcesPath = parseLinkCell(cells[4]);
  if (reportPath === null || sourcesPath === null) return null;
  const sourceMaterialPath = cells.length === 8 ? parseOptionalLinkCell(cells[5]) : "-";
  if (sourceMaterialPath === null) return null;
  const aggregate = cells[cells.length === 8 ? 6 : 5].trim();
  if (!aggregatePrefixPattern.test(aggregate)) return null;
  const updatedAt = cells[cells.length === 8 ? 7 : 6];
  if (!textCellIsSafe(updatedAt)) return null;
  return {
    weekKey: sanitizeText(cells[0]),
    topic: sanitizeText(cells[1]),
    jobId: sanitizeText(cells[2]),
    reportPath,
    sourcesPath,
    sourceMaterialPath,
    aggregateSha256: aggregate.padEnd(64, "0"),
    updatedAt: sanitizeText(updatedAt),
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

function parseLinkCell(cell: string): string | null {
  const trimmed = cell.trim();
  if (trimmed === "-") return "-";
  const match = /^\[([^\]\n\r]*)\]\(([A-Za-z0-9._~/-]+)\)$/.exec(trimmed);
  if (match === null) return null;
  const linkPath = match[2];
  return isSafeRepoRelativePath(linkPath) ? linkPath : null;
}

function parseOptionalLinkCell(cell: string): string | null {
  const trimmed = cell.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed === "-" || trimmed === "n/a") return "-";
  return parseLinkCell(cell);
}

function renderTable(rows: readonly ReadmePublishEntry[]): string {
  const ordered = [...rows].sort((a, b) => {
    const week = b.weekKey.localeCompare(a.weekKey);
    if (week !== 0) return week;
    return a.jobId.localeCompare(b.jobId);
  });
  const lines = [
    "| Week | Topic | Job | Report | Sources | Source Material | Aggregate | Updated |",
    "|---|---|---|---|---|---|---|---|",
    ...ordered.map((row) =>
      `| ${[
        markdownText(row.weekKey),
        markdownText(row.topic),
        markdownText(row.jobId),
        renderLinkCell(row.reportPath),
        renderLinkCell(row.sourcesPath),
        renderLinkCell(row.sourceMaterialPath),
        row.aggregateSha256.slice(0, 12).toLowerCase(),
        markdownText(row.updatedAt),
      ].join(" | ")} |`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function renderLinkCell(value: string): string {
  if (value === "-") return "-";
  if (!isSafeRepoRelativePath(value)) {
    throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", "unsafe README link");
  }
  return `[${markdownText(value)}](${value})`;
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

function isSafeManifestRelativePath(value: string): boolean {
  return isSafeRepoRelativePath(value) && !value.startsWith("../");
}

function isInsidePosix(root: string, candidate: string): boolean {
  const relative = path.posix.relative(root, candidate);
  return relative === "" || (!relative.startsWith("../") && relative !== "..");
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertNoSymlinkComponents(root: string, candidate: string, label: string): void {
  const relative = path.relative(root, candidate);
  if (relative === "") return;
  const parts = relative.split(path.sep);
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.resolve(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (err) {
      throw new ReadmePublishDestinationError("PUBLISH_SOURCE_MISSING", `${label} parent missing`, err);
    }
    if (stat.isSymbolicLink()) {
      throw new ReadmePublishDestinationError("PUBLISH_MANIFEST_INVALID", `${label} symlink component`);
    }
    if (!stat.isDirectory()) {
      throw new ReadmePublishDestinationError("PUBLISH_SOURCE_MISSING", `${label} parent missing`);
    }
  }
}

function formatUpdatedAt(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return new Date(value * 1000).toISOString();
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
  return !/[\[\]()]/.test(value) && !/[\r\n\t]/.test(value);
}

function unescapeCell(value: string): string {
  return value.replaceAll("\\|", "|");
}

function isFormatValidJobId(value: string): boolean {
  const normalized = sanitizeText(value);
  return normalized.length > 0 && !normalized.startsWith("-") && !/[\r\n\t]/.test(value);
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
