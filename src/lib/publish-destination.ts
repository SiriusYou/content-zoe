import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import type { PublishManifest } from "../promote.ts";

export type PublishDestinationKind = "local_folder";
export type DeliveryStatus = "delivered" | "idempotent";

export interface DeliveryReceipt {
  readonly schema_version: 1;
  readonly destination_kind: PublishDestinationKind;
  readonly job_id: string;
  readonly attempt_number: number;
  readonly source_artifact_dir: string;
  readonly delivered_artifact_dir: string;
  readonly files: readonly string[];
  readonly sha256: Readonly<Record<string, string>>;
  readonly aggregate_sha256: string;
  readonly delivered_at: string;
}

export interface DeliveryResult {
  readonly status: DeliveryStatus;
  readonly destinationKind: PublishDestinationKind;
  readonly jobId: string;
  readonly artifactDir: string;
  readonly deliveredDir: string;
  readonly files: number;
  readonly aggregateSha256: string;
  readonly receipt: DeliveryReceipt;
}

export interface PublishDestinationInput {
  readonly cwd: string;
  readonly destinationRoot: string;
  readonly manifest: PublishManifest;
  readonly now?: () => Date;
}

export interface PublishDestination {
  deliver(input: PublishDestinationInput): DeliveryResult;
}

export type PublishDestinationErrorCode =
  | "INVALID_DESTINATION"
  | "PUBLISH_SOURCE_MISSING"
  | "PUBLISH_MANIFEST_INVALID"
  | "DELIVERY_ARTIFACT_DIVERGED"
  | "DELIVERY_FAILED";

export class PublishDestinationError extends Error {
  readonly name = "PublishDestinationError";
  readonly code: PublishDestinationErrorCode;
  override readonly cause?: unknown;

  constructor(
    code: PublishDestinationErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(`${code}: ${message}`);
    this.code = code;
    this.cause = cause;
  }
}

const protectedDestinationRoots = new Set([
  ".git",
  ".runs",
  ".data",
  ".omx",
  "reports",
  "src",
  "scripts",
  "docs",
  "node_modules",
]);

export class LocalFolderPublishDestination implements PublishDestination {
  deliver(input: PublishDestinationInput): DeliveryResult {
    const realCwd = safeRealpath(input.cwd, "repository cwd");
    const manifest = validateManifest(input.manifest);
    const sourceRoot = resolveSourceArtifactDir(realCwd, manifest.artifact_dir);
    const sourceSnapshot = verifySourceBundle(realCwd, sourceRoot, manifest);
    const destinationRoot = resolveDestinationRoot({
      destinationRoot: input.destinationRoot,
      realCwd,
      sourceRoot,
    });
    const deliveredDir = path.resolve(
      destinationRoot.absolute,
      path.basename(manifest.artifact_dir),
    );
    assertInside(destinationRoot.absolute, deliveredDir, "delivered bundle");
    if (path.resolve(deliveredDir) === sourceRoot) {
      throw new PublishDestinationError(
        "INVALID_DESTINATION",
        "destination resolves to source artifact directory",
      );
    }

    const deliveredRelative = toPosixRelative(realCwd, deliveredDir);
    const existingReceipt = readIdempotentReceipt(deliveredDir, {
      deliveredRelative,
      manifest,
      sourceSnapshot,
    });
    if (existingReceipt !== null) {
      return {
        status: "idempotent",
        destinationKind: "local_folder",
        jobId: manifest.job_id,
        artifactDir: manifest.artifact_dir,
        deliveredDir: deliveredRelative,
        files: manifest.files.length,
        aggregateSha256: manifest.aggregate_sha256,
        receipt: existingReceipt,
      };
    }

    if (existsSync(deliveredDir)) {
      throw new PublishDestinationError(
        "DELIVERY_ARTIFACT_DIVERGED",
        "destination bundle exists but does not match delivery receipt or manifest",
      );
    }

    mkdirSync(destinationRoot.absolute, { recursive: true });
    const tempDir = allocateTempDir(destinationRoot.absolute, manifest);
    const receipt = buildReceipt({
      deliveredAt: (input.now ?? (() => new Date()))().toISOString(),
      deliveredRelative,
      manifest,
      sourceSnapshot,
    });

    try {
      copyBundle(sourceRoot, tempDir, manifest.files);
      writeFileSync(
        path.resolve(tempDir, ".delivery-receipt.json"),
        `${stableStringifyReceipt(receipt)}\n`,
        "utf8",
      );
      verifyDeliveredBundle(tempDir, receipt, manifest);
      if (existsSync(deliveredDir)) {
        throw new PublishDestinationError(
          "DELIVERY_ARTIFACT_DIVERGED",
          "destination appeared during delivery",
        );
      }
      renameSync(tempDir, deliveredDir);
      verifyDeliveredBundle(deliveredDir, receipt, manifest);
      return {
        status: "delivered",
        destinationKind: "local_folder",
        jobId: manifest.job_id,
        artifactDir: manifest.artifact_dir,
        deliveredDir: deliveredRelative,
        files: manifest.files.length,
        aggregateSha256: manifest.aggregate_sha256,
        receipt,
      };
    } catch (err) {
      if (err instanceof PublishDestinationError) {
        cleanupTempDir(tempDir);
        throw err;
      }
      cleanupTempDir(tempDir);
      throw new PublishDestinationError(
        "DELIVERY_FAILED",
        formatThrown(err),
        err,
      );
    }
  }
}

function validateManifest(manifest: PublishManifest): PublishManifest {
  if (typeof manifest.job_id !== "string" || manifest.job_id.trim().length === 0) {
    throw invalidManifest("missing job_id");
  }
  if (!Number.isInteger(manifest.attempt_number) || manifest.attempt_number < 1) {
    throw invalidManifest("invalid attempt_number");
  }
  if (typeof manifest.artifact_dir !== "string" || manifest.artifact_dir.trim().length === 0) {
    throw invalidManifest("missing artifact_dir");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw invalidManifest("files must be non-empty");
  }
  if (!isPlainRecord(manifest.sha256)) {
    throw invalidManifest("sha256 must be an object");
  }
  if (!isFullSha(manifest.aggregate_sha256)) {
    throw invalidManifest("aggregate_sha256 must be a 64-character hex digest");
  }

  const files = [...manifest.files];
  const sorted = [...files].sort();
  if (JSON.stringify(files) !== JSON.stringify(sorted)) {
    throw invalidManifest("files must be sorted");
  }
  if (new Set(files).size !== files.length) {
    throw invalidManifest("files must be unique");
  }
  for (const file of files) {
    validateRelativeBundlePath(file, "manifest file");
  }
  const keys = Object.keys(manifest.sha256).sort();
  if (JSON.stringify(keys) !== JSON.stringify(files)) {
    throw invalidManifest("sha256 keys must exactly match files");
  }
  for (const file of files) {
    if (!isFullSha(manifest.sha256[file])) {
      throw invalidManifest(`invalid sha256 for ${file}`);
    }
  }
  const aggregate = aggregateFor(files, manifest.sha256);
  if (aggregate !== manifest.aggregate_sha256) {
    throw invalidManifest("aggregate_sha256 does not match files and hashes");
  }
  return manifest;
}

function resolveSourceArtifactDir(realCwd: string, artifactDir: string): string {
  validateRelativeBundlePath(artifactDir, "artifact_dir");
  const sourceRoot = path.resolve(realCwd, artifactDir);
  assertInside(realCwd, sourceRoot, "artifact_dir");
  assertNoEscapingSymlinkComponents(realCwd, artifactDir, "artifact_dir");

  let realSourceRoot: string;
  try {
    realSourceRoot = realpathSync(sourceRoot);
  } catch (err) {
    throw new PublishDestinationError(
      "PUBLISH_SOURCE_MISSING",
      `source artifact directory missing: ${artifactDir}`,
      err,
    );
  }
  assertInside(realCwd, realSourceRoot, "artifact_dir");
  if (!lstatSync(realSourceRoot).isDirectory()) {
    throw new PublishDestinationError(
      "PUBLISH_SOURCE_MISSING",
      `source artifact directory is not a directory: ${artifactDir}`,
    );
  }
  return realSourceRoot;
}

function verifySourceBundle(
  realCwd: string,
  sourceRoot: string,
  manifest: PublishManifest,
): Readonly<Record<string, string>> {
  const sha256: Record<string, string> = {};
  for (const file of manifest.files) {
    const sourceFile = path.resolve(sourceRoot, file);
    assertInside(sourceRoot, sourceFile, `source file ${file}`);
    assertNoEscapingSymlinkComponents(sourceRoot, file, `source file ${file}`);
    assertInside(realCwd, sourceFile, `source file ${file}`);
    let stat;
    try {
      stat = lstatSync(sourceFile);
    } catch (err) {
      throw new PublishDestinationError(
        "PUBLISH_SOURCE_MISSING",
        `source file missing: ${file}`,
        err,
      );
    }
    if (!stat.isFile()) {
      throw new PublishDestinationError(
        "PUBLISH_MANIFEST_INVALID",
        `source file is not a regular file: ${file}`,
      );
    }
    sha256[file] = shaFile(sourceFile);
    if (sha256[file] !== manifest.sha256[file]) {
      throw new PublishDestinationError(
        "PUBLISH_MANIFEST_INVALID",
        `source file hash does not match manifest: ${file}`,
      );
    }
  }
  if (aggregateFor(manifest.files, sha256) !== manifest.aggregate_sha256) {
    throw new PublishDestinationError(
      "PUBLISH_MANIFEST_INVALID",
      "source aggregate hash does not match manifest",
    );
  }
  return sha256;
}

function resolveDestinationRoot(opts: {
  readonly destinationRoot: string;
  readonly realCwd: string;
  readonly sourceRoot: string;
}): { readonly absolute: string; readonly relative: string } {
  const relative = normalizeDestinationRoot(opts.destinationRoot);
  const firstSegment = relative.split("/")[0] ?? "";
  if (protectedDestinationRoots.has(firstSegment)) {
    throw new PublishDestinationError(
      "INVALID_DESTINATION",
      `destination uses protected root: ${firstSegment}`,
    );
  }
  assertNoUnsafeDestinationSymlinkComponents(opts.realCwd, relative);
  const absolute = path.resolve(opts.realCwd, relative);
  assertInside(opts.realCwd, absolute, "destination");
  if (path.resolve(absolute) === opts.sourceRoot) {
    throw new PublishDestinationError(
      "INVALID_DESTINATION",
      "destination resolves to source artifact directory",
    );
  }
  return { absolute, relative };
}

function normalizeDestinationRoot(raw: string): string {
  if (typeof raw !== "string") {
    throw new PublishDestinationError("INVALID_DESTINATION", "destination is required");
  }
  const value = raw.trim();
  if (
    value.length === 0 ||
    value.startsWith("-") ||
    path.isAbsolute(value) ||
    /[\r\n\t]/.test(value)
  ) {
    throw new PublishDestinationError("INVALID_DESTINATION", "invalid destination path");
  }
  validateRelativeBundlePath(value, "destination");
  return toPosixPath(value);
}

function readIdempotentReceipt(
  deliveredDir: string,
  params: {
    readonly deliveredRelative: string;
    readonly manifest: PublishManifest;
    readonly sourceSnapshot: Readonly<Record<string, string>>;
  },
): DeliveryReceipt | null {
  if (!existsSync(deliveredDir)) return null;
  const receiptPath = path.resolve(deliveredDir, ".delivery-receipt.json");
  if (!existsSync(receiptPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(receiptPath, "utf8"));
  } catch {
    return null;
  }
  const receipt = readReceipt(parsed);
  if (receipt === null) return null;
  if (!receiptMatches(receipt, params)) return null;
  verifyDeliveredBundle(deliveredDir, receipt, params.manifest);
  return receipt;
}

function copyBundle(sourceRoot: string, tempDir: string, files: readonly string[]): void {
  mkdirSync(tempDir, { recursive: false });
  for (const file of files) {
    const sourceFile = path.resolve(sourceRoot, file);
    const targetFile = path.resolve(tempDir, file);
    assertInside(tempDir, targetFile, `target file ${file}`);
    mkdirSync(path.dirname(targetFile), { recursive: true });
    copyFileSync(sourceFile, targetFile);
  }
}

function verifyDeliveredBundle(
  deliveredDir: string,
  receipt: DeliveryReceipt,
  manifest: PublishManifest,
): void {
  const sha256: Record<string, string> = {};
  for (const file of manifest.files) {
    const deliveredFile = path.resolve(deliveredDir, file);
    assertInside(deliveredDir, deliveredFile, `delivered file ${file}`);
    let stat;
    try {
      stat = lstatSync(deliveredFile);
    } catch (err) {
      throw new PublishDestinationError(
        "DELIVERY_ARTIFACT_DIVERGED",
        `delivered file missing: ${file}`,
        err,
      );
    }
    if (!stat.isFile()) {
      throw new PublishDestinationError(
        "DELIVERY_ARTIFACT_DIVERGED",
        `delivered path is not a file: ${file}`,
      );
    }
    sha256[file] = shaFile(deliveredFile);
    if (sha256[file] !== manifest.sha256[file]) {
      throw new PublishDestinationError(
        "DELIVERY_ARTIFACT_DIVERGED",
        `delivered file hash diverged: ${file}`,
      );
    }
  }
  if (aggregateFor(manifest.files, sha256) !== receipt.aggregate_sha256) {
    throw new PublishDestinationError(
      "DELIVERY_ARTIFACT_DIVERGED",
      "delivered aggregate hash diverged",
    );
  }
}

function buildReceipt(params: {
  readonly deliveredAt: string;
  readonly deliveredRelative: string;
  readonly manifest: PublishManifest;
  readonly sourceSnapshot: Readonly<Record<string, string>>;
}): DeliveryReceipt {
  return {
    schema_version: 1,
    destination_kind: "local_folder",
    job_id: params.manifest.job_id,
    attempt_number: params.manifest.attempt_number,
    source_artifact_dir: params.manifest.artifact_dir,
    delivered_artifact_dir: params.deliveredRelative,
    files: params.manifest.files,
    sha256: params.sourceSnapshot,
    aggregate_sha256: params.manifest.aggregate_sha256,
    delivered_at: params.deliveredAt,
  };
}

function receiptMatches(
  receipt: DeliveryReceipt,
  params: {
    readonly deliveredRelative: string;
    readonly manifest: PublishManifest;
    readonly sourceSnapshot: Readonly<Record<string, string>>;
  },
): boolean {
  return (
    receipt.schema_version === 1 &&
    receipt.destination_kind === "local_folder" &&
    receipt.job_id === params.manifest.job_id &&
    receipt.attempt_number === params.manifest.attempt_number &&
    receipt.source_artifact_dir === params.manifest.artifact_dir &&
    receipt.delivered_artifact_dir === params.deliveredRelative &&
    receipt.aggregate_sha256 === params.manifest.aggregate_sha256 &&
    JSON.stringify(receipt.files) === JSON.stringify(params.manifest.files) &&
    JSON.stringify(receipt.sha256) === JSON.stringify(params.sourceSnapshot) &&
    typeof receipt.delivered_at === "string" &&
    receipt.delivered_at.length > 0
  );
}

function readReceipt(value: unknown): DeliveryReceipt | null {
  if (!isPlainRecord(value)) return null;
  if (value.schema_version !== 1) return null;
  if (value.destination_kind !== "local_folder") return null;
  if (typeof value.job_id !== "string") return null;
  if (!Number.isInteger(value.attempt_number)) return null;
  if (typeof value.source_artifact_dir !== "string") return null;
  if (typeof value.delivered_artifact_dir !== "string") return null;
  if (!Array.isArray(value.files) || !value.files.every((file) => typeof file === "string")) {
    return null;
  }
  if (!isPlainRecord(value.sha256)) return null;
  if (typeof value.aggregate_sha256 !== "string") return null;
  if (typeof value.delivered_at !== "string") return null;
  return value as unknown as DeliveryReceipt;
}

function stableStringifyReceipt(receipt: DeliveryReceipt): string {
  return JSON.stringify({
    schema_version: receipt.schema_version,
    destination_kind: receipt.destination_kind,
    job_id: receipt.job_id,
    attempt_number: receipt.attempt_number,
    source_artifact_dir: receipt.source_artifact_dir,
    delivered_artifact_dir: receipt.delivered_artifact_dir,
    files: receipt.files,
    sha256: receipt.sha256,
    aggregate_sha256: receipt.aggregate_sha256,
    delivered_at: receipt.delivered_at,
  }, null, 2);
}

function allocateTempDir(destinationRoot: string, manifest: PublishManifest): string {
  const safeJobId = manifest.job_id.replace(/[^A-Za-z0-9._-]/g, "_");
  for (let index = 0; index < 100; index += 1) {
    const candidate = path.resolve(
      destinationRoot,
      `.delivery-tmp-${safeJobId}-${manifest.attempt_number}-${Date.now()}-${index}`,
    );
    if (!existsSync(candidate)) return candidate;
  }
  throw new PublishDestinationError("DELIVERY_FAILED", "could not allocate delivery temp directory");
}

function cleanupTempDir(tempDir: string): void {
  rmSync(tempDir, { recursive: true, force: true });
}

function validateRelativeBundlePath(value: string, subject: string): void {
  const normalized = toPosixPath(value);
  const parts = normalized.split("/");
  if (
    normalized.length === 0 ||
    path.isAbsolute(value) ||
    parts.some((part) => part.length === 0 || part === "." || part === "..") ||
    /[\r\n\t]/.test(value)
  ) {
    throw new PublishDestinationError(
      subject === "destination" ? "INVALID_DESTINATION" : "PUBLISH_MANIFEST_INVALID",
      `${subject} must be a safe relative path`,
    );
  }
}

function assertNoUnsafeDestinationSymlinkComponents(
  root: string,
  relativePath: string,
): void {
  const parts = toPosixPath(relativePath).split("/");
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.resolve(current, parts[index]);
    if (!existsSync(current)) return;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      const real = realpathSync(current);
      if (!isInside(root, real)) {
        throw new PublishDestinationError(
          "INVALID_DESTINATION",
          "destination escapes through symlink",
        );
      }
      assertNotInsideProtectedDestinationRoot(root, real);
    }
  }
}

function assertNoEscapingSymlinkComponents(
  root: string,
  relativePath: string,
  subject: string,
): void {
  const parts = toPosixPath(relativePath).split("/");
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.resolve(current, parts[index]);
    if (!existsSync(current)) return;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      const real = realpathSync(current);
      if (!isInside(root, real)) {
        throw new PublishDestinationError(
          subject === "destination" ? "INVALID_DESTINATION" : "PUBLISH_MANIFEST_INVALID",
          `${subject} escapes through symlink`,
        );
      }
    }
  }
}

function assertNotInsideProtectedDestinationRoot(root: string, candidate: string): void {
  for (const protectedRoot of protectedDestinationRoots) {
    const protectedPath = path.resolve(root, protectedRoot);
    if (isInside(protectedPath, candidate)) {
      throw new PublishDestinationError(
        "INVALID_DESTINATION",
        `destination resolves through protected root: ${protectedRoot}`,
      );
    }
  }
}

function assertInside(root: string, candidate: string, subject: string): void {
  if (!isInside(root, candidate)) {
    throw new PublishDestinationError(
      subject.startsWith("destination") ? "INVALID_DESTINATION" : "PUBLISH_MANIFEST_INVALID",
      `${subject} escapes its root`,
    );
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toPosixRelative(root: string, target: string): string {
  return toPosixPath(path.relative(root, target));
}

function toPosixPath(value: string): string {
  return value.replaceAll(path.sep, "/");
}

function safeRealpath(value: string, subject: string): string {
  try {
    return realpathSync(value);
  } catch (err) {
    throw new PublishDestinationError("INVALID_DESTINATION", `${subject} is unavailable`, err);
  }
}

function shaFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function aggregateFor(
  files: readonly string[],
  sha256: Readonly<Record<string, string>>,
): string {
  return createHash("sha256")
    .update(JSON.stringify(files.map((file) => [file, sha256[file]])))
    .digest("hex");
}

function invalidManifest(message: string): PublishDestinationError {
  return new PublishDestinationError("PUBLISH_MANIFEST_INVALID", message);
}

function isFullSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
