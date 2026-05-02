export const APPROVAL_SUMMARY_MAX_CHARS = 3500;
export const EVIDENCE_GRADE_WARN_RE =
  /<!--\s*EVIDENCE_GRADE_WARN:\s*([\s\S]*?)\s*-->/g;
export const TRUNCATION_MARKER = "\n\n[approval-summary truncated]";

export interface ApprovalSummaryPaths {
  reportEn: string;
  reportZh?: string;
  sources?: string;
}

export interface ComposeApprovalSummaryOptions {
  jobId: string;
  attemptNumber: number;
  locales: readonly ("en" | "zh")[];
  reportEnText: string;
  reportZhText?: string;
  paths: ApprovalSummaryPaths;
}

const PREVIEW_MAX_CHARS = 900;
const PREVIEW_TRUNCATION_MARKER = "\n\n[preview truncated]";

export function composeApprovalSummary(
  opts: ComposeApprovalSummaryOptions,
): string {
  const hasChinese = opts.locales.includes("zh");
  if (hasChinese && !opts.paths.reportZh) {
    throw new Error("approval summary requires report.zh.md path for locales=en,zh");
  }
  if (hasChinese && opts.reportZhText === undefined) {
    throw new Error("approval summary requires report.zh.md text for locales=en,zh");
  }

  const warnings = extractEvidenceWarnings(opts.reportEnText);

  const lines = [
    "# Approval Summary",
    "",
    `- Job ID: ${opts.jobId}`,
    `- Attempt: ${opts.attemptNumber}`,
    `- Locales: ${opts.locales.join(",")}`,
    opts.paths.sources ? `- Sources: ${opts.paths.sources}` : "- Sources: not recorded",
    "",
    "## English Report",
    "",
    `Path: ${opts.paths.reportEn}`,
    "",
    "Preview:",
    previewText(opts.reportEnText),
    "",
    "## Chinese Report",
    "",
  ];

  if (hasChinese) {
    lines.push(
      `Path: ${opts.paths.reportZh}`,
      "",
      "Preview:",
      previewText(opts.reportZhText ?? ""),
      "",
    );
  } else {
    lines.push("Skipped: locales=en; Chinese translation was not requested.", "");
  }

  lines.push("## Evidence Grade Warnings", "");
  if (warnings.length === 0) {
    lines.push("No Evidence Grade warnings were found.");
  } else {
    warnings.forEach((warning, index) => {
      lines.push(`${index + 1}. ${warning}`);
    });
  }

  return boundSummary(lines.join("\n"));
}

function extractEvidenceWarnings(text: string): string[] {
  EVIDENCE_GRADE_WARN_RE.lastIndex = 0;
  return [...text.matchAll(EVIDENCE_GRADE_WARN_RE)]
    .map((match) => (match[1] ?? "").trim())
    .filter((payload) => payload.length > 0);
}

function previewText(text: string): string {
  const normalized = stripEvidenceWarnings(text)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .trim();
  if (normalized.length <= PREVIEW_MAX_CHARS) return normalized;
  return `${normalized.slice(0, PREVIEW_MAX_CHARS)}${PREVIEW_TRUNCATION_MARKER}`;
}

function stripEvidenceWarnings(text: string): string {
  EVIDENCE_GRADE_WARN_RE.lastIndex = 0;
  return text.replace(EVIDENCE_GRADE_WARN_RE, "");
}

function boundSummary(summary: string): string {
  if (summary.length <= APPROVAL_SUMMARY_MAX_CHARS) return summary;
  const keepChars = Math.max(0, APPROVAL_SUMMARY_MAX_CHARS - TRUNCATION_MARKER.length);
  return `${summary.slice(0, keepChars)}${TRUNCATION_MARKER}`;
}
