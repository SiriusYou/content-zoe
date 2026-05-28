import {
  mkdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ImageSpecParseError,
  parseImageSpec,
  type ImageSpec,
} from "../src/pipeline/image/spec.ts";
import {
  JudgeVerdictParseError,
  parseJudgeVerdict,
  type JudgeVerdict,
} from "../src/pipeline/image/verdict.ts";

type ScenarioName =
  | "valid-spec-roundtrip-strips-extra-fields"
  | "spec-input-non-object-or-array"
  | "spec-missing-subject"
  | "spec-whitespace-required-string"
  | "spec-palette-not-array"
  | "spec-palette-empty-string"
  | "spec-negative-constraints-not-array"
  | "spec-negative-constraints-empty-string"
  | "spec-dimensions-non-number"
  | "spec-dimensions-non-positive-or-non-integer"
  | "spec-dimensions-unsupported-preset"
  | "spec-acceptance-empty-array"
  | "spec-acceptance-invalid-tier"
  | "spec-acceptance-whitespace-id-or-description"
  | "spec-acceptance-duplicate-id-after-trim"
  | "valid-verdict-roundtrip-strips-extra-fields"
  | "valid-verdict-feedback-absent-when-pass"
  | "verdict-input-non-object-or-array"
  | "verdict-missing-overallPass"
  | "verdict-criteria-empty-array"
  | "verdict-criteria-pass-non-boolean"
  | "verdict-criterion-whitespace-id-or-rationale"
  | "verdict-score-non-number-or-non-finite"
  | "verdict-duplicate-criterion-id-after-trim"
  | "verdict-overall-pass-inconsistent-with-criterion"
  | "verdict-failed-without-feedback"
  | "verdict-feedback-non-string-or-empty";

interface ScenarioOutcome {
  name: ScenarioName;
  status: "PASS" | "FAIL";
  details: string[];
  startedAtIso: string;
  finishedAtIso: string;
}

const SCENARIOS: readonly ScenarioName[] = [
  "valid-spec-roundtrip-strips-extra-fields",
  "spec-input-non-object-or-array",
  "spec-missing-subject",
  "spec-whitespace-required-string",
  "spec-palette-not-array",
  "spec-palette-empty-string",
  "spec-negative-constraints-not-array",
  "spec-negative-constraints-empty-string",
  "spec-dimensions-non-number",
  "spec-dimensions-non-positive-or-non-integer",
  "spec-dimensions-unsupported-preset",
  "spec-acceptance-empty-array",
  "spec-acceptance-invalid-tier",
  "spec-acceptance-whitespace-id-or-description",
  "spec-acceptance-duplicate-id-after-trim",
  "valid-verdict-roundtrip-strips-extra-fields",
  "valid-verdict-feedback-absent-when-pass",
  "verdict-input-non-object-or-array",
  "verdict-missing-overallPass",
  "verdict-criteria-empty-array",
  "verdict-criteria-pass-non-boolean",
  "verdict-criterion-whitespace-id-or-rationale",
  "verdict-score-non-number-or-non-finite",
  "verdict-duplicate-criterion-id-after-trim",
  "verdict-overall-pass-inconsistent-with-criterion",
  "verdict-failed-without-feedback",
  "verdict-feedback-non-string-or-empty",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = resolve(
  repoRoot,
  ".runs",
  "image-contracts-smoke",
  new Date().toISOString().replaceAll(":", "-"),
);
const docPath = resolve(repoRoot, "docs", "preflight", "image-contracts-smoke.md");

async function main(): Promise<number> {
  mkdirSync(smokeRoot, { recursive: true });
  const outcomes: ScenarioOutcome[] = [];

  try {
    for (const name of SCENARIOS) {
      outcomes.push(runScenario(name));
    }
  } finally {
    writeEvidence(outcomes);
    rmSync(smokeRoot, { recursive: true, force: true });
    removeEmptyDir(resolve(repoRoot, ".runs", "image-contracts-smoke"));
    removeEmptyDir(resolve(repoRoot, ".runs"));
  }

  for (const outcome of outcomes) {
    console.log(`${outcome.status} ${outcome.name}`);
    for (const detail of outcome.details) {
      console.log(`  - ${detail}`);
    }
  }

  const passed = outcomes.filter((outcome) => outcome.status === "PASS").length;
  console.log(`${passed}/${outcomes.length} PASS`);
  return passed === outcomes.length ? 0 : 1;
}

function runScenario(name: ScenarioName): ScenarioOutcome {
  const startedAtIso = new Date().toISOString();
  try {
    const details = scenarioImpl(name);
    return {
      name,
      status: "PASS",
      details,
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  } catch (err) {
    return {
      name,
      status: "FAIL",
      details: [formatError(err)],
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
    };
  }
}

function scenarioImpl(name: ScenarioName): string[] {
  switch (name) {
    case "valid-spec-roundtrip-strips-extra-fields":
      return validSpecRoundtrip();
    case "spec-input-non-object-or-array":
      return specInputNonObjectOrArray();
    case "spec-missing-subject":
      return specMissingSubject();
    case "spec-whitespace-required-string":
      return specWhitespaceRequiredString();
    case "spec-palette-not-array":
      return specPaletteNotArray();
    case "spec-palette-empty-string":
      return specPaletteEmptyString();
    case "spec-negative-constraints-not-array":
      return specNegativeConstraintsNotArray();
    case "spec-negative-constraints-empty-string":
      return specNegativeConstraintsEmptyString();
    case "spec-dimensions-non-number":
      return specDimensionsNonNumber();
    case "spec-dimensions-non-positive-or-non-integer":
      return specDimensionsNonPositiveOrNonInteger();
    case "spec-dimensions-unsupported-preset":
      return specDimensionsUnsupportedPreset();
    case "spec-acceptance-empty-array":
      return specAcceptanceEmptyArray();
    case "spec-acceptance-invalid-tier":
      return specAcceptanceInvalidTier();
    case "spec-acceptance-whitespace-id-or-description":
      return specAcceptanceWhitespaceIdOrDescription();
    case "spec-acceptance-duplicate-id-after-trim":
      return specAcceptanceDuplicateIdAfterTrim();
    case "valid-verdict-roundtrip-strips-extra-fields":
      return validVerdictRoundtrip();
    case "valid-verdict-feedback-absent-when-pass":
      return validVerdictFeedbackAbsentWhenPass();
    case "verdict-input-non-object-or-array":
      return verdictInputNonObjectOrArray();
    case "verdict-missing-overallPass":
      return verdictMissingOverallPass();
    case "verdict-criteria-empty-array":
      return verdictCriteriaEmptyArray();
    case "verdict-criteria-pass-non-boolean":
      return verdictCriteriaPassNonBoolean();
    case "verdict-criterion-whitespace-id-or-rationale":
      return verdictCriterionWhitespaceIdOrRationale();
    case "verdict-score-non-number-or-non-finite":
      return verdictScoreNonNumberOrNonFinite();
    case "verdict-duplicate-criterion-id-after-trim":
      return verdictDuplicateCriterionIdAfterTrim();
    case "verdict-overall-pass-inconsistent-with-criterion":
      return verdictOverallPassInconsistentWithCriterion();
    case "verdict-failed-without-feedback":
      return verdictFailedWithoutFeedback();
    case "verdict-feedback-non-string-or-empty":
      return verdictFeedbackNonStringOrEmpty();
  }
}

function validSpecRoundtrip(): string[] {
  const spec = parseImageSpec({
    ...validSpecInput(),
    extra: "drop me",
  });
  assert(spec.subject === "an annotated care-team handoff board", "subject should parse");
  assert(spec.dimensions.w === 1024 && spec.dimensions.h === 1024, "dimensions should parse");
  assert(!("extra" in spec), "extra top-level fields should be stripped");
  assert(!("extra" in spec.acceptanceCriteria[0]), "extra nested fields should be stripped");
  return ["Valid ImageSpec parsed, normalized, and stripped unknown fields."];
}

function specInputNonObjectOrArray(): string[] {
  for (const value of [null, "nope", 3, []]) {
    assertImageSpecInvalid(() => parseImageSpec(value), "object");
  }
  return ["Null, primitive, and array spec inputs fail closed."];
}

function specMissingSubject(): string[] {
  const input = validSpecInput();
  delete input.subject;
  assertImageSpecInvalid(() => parseImageSpec(input), "subject");
  return ["Missing subject is rejected."];
}

function specWhitespaceRequiredString(): string[] {
  const input = validSpecInput({ style: "   " });
  assertImageSpecInvalid(() => parseImageSpec(input), "style");
  return ["Whitespace-only required string is rejected."];
}

function specPaletteNotArray(): string[] {
  assertImageSpecInvalid(
    () => parseImageSpec(validSpecInput({ palette: "blue" })),
    "palette",
  );
  return ["Non-array palette is rejected."];
}

function specPaletteEmptyString(): string[] {
  assertImageSpecInvalid(
    () => parseImageSpec(validSpecInput({ palette: ["navy", " "] })),
    "palette[1]",
  );
  return ["Empty palette entry is rejected."];
}

function specNegativeConstraintsNotArray(): string[] {
  assertImageSpecInvalid(
    () => parseImageSpec(validSpecInput({ negativeConstraints: "no text" })),
    "negativeConstraints",
  );
  return ["Non-array negativeConstraints is rejected."];
}

function specNegativeConstraintsEmptyString(): string[] {
  assertImageSpecInvalid(
    () =>
      parseImageSpec(validSpecInput({ negativeConstraints: ["no faces", ""] })),
    "negativeConstraints[1]",
  );
  return ["Empty negativeConstraints entry is rejected."];
}

function specDimensionsNonNumber(): string[] {
  assertImageSpecInvalid(
    () => parseImageSpec(validSpecInput({ dimensions: { w: "1024", h: 1024 } })),
    "dimensions.w",
  );
  return ["Non-number dimensions are rejected."];
}

function specDimensionsNonPositiveOrNonInteger(): string[] {
  for (const dimensions of [
    { w: 0, h: 1024 },
    { w: -1024, h: 1024 },
    { w: 1024.5, h: 1024 },
  ]) {
    assertImageSpecInvalid(
      () => parseImageSpec(validSpecInput({ dimensions })),
      "dimensions.w",
    );
  }
  return ["Zero, negative, and non-integer dimensions are rejected."];
}

function specDimensionsUnsupportedPreset(): string[] {
  assertImageSpecInvalid(
    () => parseImageSpec(validSpecInput({ dimensions: { w: 640, h: 480 } })),
    "dimensions",
  );
  return ["Unsupported positive dimensions are rejected."];
}

function specAcceptanceEmptyArray(): string[] {
  assertImageSpecInvalid(
    () => parseImageSpec(validSpecInput({ acceptanceCriteria: [] })),
    "acceptanceCriteria",
  );
  return ["Empty acceptance criteria are rejected."];
}

function specAcceptanceInvalidTier(): string[] {
  assertImageSpecInvalid(
    () =>
      parseImageSpec(
        validSpecInput({
          acceptanceCriteria: [{ id: "subject", description: "Subject", tier: "visual" }],
        }),
      ),
    "tier",
  );
  return ["Invalid acceptance criterion tier is rejected."];
}

function specAcceptanceWhitespaceIdOrDescription(): string[] {
  assertImageSpecInvalid(
    () =>
      parseImageSpec(
        validSpecInput({
          acceptanceCriteria: [{ id: " ", description: "Subject", tier: "judged" }],
        }),
      ),
    "id",
  );
  assertImageSpecInvalid(
    () =>
      parseImageSpec(
        validSpecInput({
          acceptanceCriteria: [{ id: "subject", description: " ", tier: "judged" }],
        }),
      ),
    "description",
  );
  return ["Whitespace criterion id and description are rejected."];
}

function specAcceptanceDuplicateIdAfterTrim(): string[] {
  assertImageSpecInvalid(
    () =>
      parseImageSpec(
        validSpecInput({
          acceptanceCriteria: [
            { id: "subject", description: "Subject visible", tier: "judged" },
            { id: " subject ", description: "Subject still visible", tier: "judged" },
          ],
        }),
      ),
    "duplicate",
  );
  return ["Duplicate acceptance ids after trimming are rejected."];
}

function validVerdictRoundtrip(): string[] {
  const verdict = parseJudgeVerdict({
    ...validPassVerdictInput(),
    extra: "drop me",
    criteria: [{ ...validPassVerdictInput().criteria[0], extra: "drop me too" }],
  });
  assert(verdict.overallPass === true, "overallPass should parse");
  assert(verdict.criteria[0].score === 0.98, "score should parse");
  assert(!("extra" in verdict), "extra top-level verdict fields should be stripped");
  assert(!("extra" in verdict.criteria[0]), "extra criterion fields should be stripped");
  return ["Valid JudgeVerdict parsed, normalized, and stripped unknown fields."];
}

function validVerdictFeedbackAbsentWhenPass(): string[] {
  const input = validPassVerdictInput();
  delete input.regenerateFeedback;
  const verdict = parseJudgeVerdict(input);
  assert(!("regenerateFeedback" in verdict), "feedback should remain absent");
  return ["Passing verdict accepts missing regenerateFeedback."];
}

function verdictInputNonObjectOrArray(): string[] {
  for (const value of [null, "nope", 3, []]) {
    assertJudgeVerdictInvalid(() => parseJudgeVerdict(value), "object");
  }
  return ["Null, primitive, and array verdict inputs fail closed."];
}

function verdictMissingOverallPass(): string[] {
  const input = validPassVerdictInput();
  delete input.overallPass;
  assertJudgeVerdictInvalid(() => parseJudgeVerdict(input), "overallPass");
  return ["Missing overallPass is rejected."];
}

function verdictCriteriaEmptyArray(): string[] {
  assertJudgeVerdictInvalid(
    () => parseJudgeVerdict({ ...validPassVerdictInput(), criteria: [] }),
    "criteria",
  );
  return ["Empty verdict criteria are rejected."];
}

function verdictCriteriaPassNonBoolean(): string[] {
  assertJudgeVerdictInvalid(
    () =>
      parseJudgeVerdict({
        ...validPassVerdictInput(),
        criteria: [{ id: "subject", pass: "yes", rationale: "Looks right" }],
      }),
    "pass",
  );
  return ["Non-boolean criterion pass is rejected."];
}

function verdictCriterionWhitespaceIdOrRationale(): string[] {
  assertJudgeVerdictInvalid(
    () =>
      parseJudgeVerdict({
        ...validPassVerdictInput(),
        criteria: [{ id: " ", pass: true, rationale: "Looks right" }],
      }),
    "id",
  );
  assertJudgeVerdictInvalid(
    () =>
      parseJudgeVerdict({
        ...validPassVerdictInput(),
        criteria: [{ id: "subject", pass: true, rationale: " " }],
      }),
    "rationale",
  );
  return ["Whitespace verdict criterion id and rationale are rejected."];
}

function verdictScoreNonNumberOrNonFinite(): string[] {
  for (const score of ["0.5", Number.NaN, Number.POSITIVE_INFINITY]) {
    assertJudgeVerdictInvalid(
      () =>
        parseJudgeVerdict({
          ...validPassVerdictInput(),
          criteria: [{ id: "subject", pass: true, score, rationale: "Looks right" }],
        }),
      "score",
    );
  }
  return ["Non-number, NaN, and Infinity scores are rejected."];
}

function verdictDuplicateCriterionIdAfterTrim(): string[] {
  assertJudgeVerdictInvalid(
    () =>
      parseJudgeVerdict({
        overallPass: true,
        criteria: [
          { id: "subject", pass: true, rationale: "Subject visible" },
          { id: " subject ", pass: true, rationale: "Subject still visible" },
        ],
      }),
    "duplicate",
  );
  return ["Duplicate verdict ids after trimming are rejected."];
}

function verdictOverallPassInconsistentWithCriterion(): string[] {
  assertJudgeVerdictInvalid(
    () =>
      parseJudgeVerdict({
        overallPass: true,
        criteria: [{ id: "subject", pass: false, rationale: "Subject missing" }],
        regenerateFeedback: "Make the subject visible.",
      }),
    "overallPass",
  );
  assertJudgeVerdictInvalid(
    () =>
      parseJudgeVerdict({
        overallPass: false,
        criteria: [{ id: "subject", pass: true, rationale: "Subject visible" }],
        regenerateFeedback: "Try again.",
      }),
    "overallPass",
  );
  return ["overallPass must match every criterion pass value."];
}

function verdictFailedWithoutFeedback(): string[] {
  assertJudgeVerdictInvalid(
    () =>
      parseJudgeVerdict({
        overallPass: false,
        criteria: [{ id: "subject", pass: false, rationale: "Subject missing" }],
      }),
    "regenerateFeedback",
  );
  return ["Failed verdicts require corrective regenerateFeedback."];
}

function verdictFeedbackNonStringOrEmpty(): string[] {
  for (const regenerateFeedback of [3, " "]) {
    assertJudgeVerdictInvalid(
      () =>
        parseJudgeVerdict({
          overallPass: false,
          criteria: [{ id: "subject", pass: false, rationale: "Subject missing" }],
          regenerateFeedback,
        }),
      "regenerateFeedback",
    );
  }
  return ["Invalid regenerateFeedback values are rejected."];
}

function validSpecInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    promptOriginal: "A hospital operations dashboard illustration",
    subject: "an annotated care-team handoff board",
    style: "editorial isometric illustration",
    composition: "single dashboard centered with labeled status columns",
    palette: ["navy", "teal", "white"],
    dimensions: { w: 1024, h: 1024 },
    negativeConstraints: ["no patient faces", "no readable PHI"],
    safetyProfile: "non-clinical operational illustration",
    acceptanceCriteria: [
      {
        id: "subject",
        description: "The handoff board is the clear subject.",
        tier: "judged",
        extra: "drop",
      },
    ],
    ...overrides,
  };
}

function validPassVerdictInput(): Record<string, unknown> & {
  criteria: Array<Record<string, unknown>>;
} {
  return {
    overallPass: true,
    criteria: [
      {
        id: "subject",
        pass: true,
        score: 0.98,
        rationale: "The handoff board is visible and central.",
      },
    ],
  };
}

function assertImageSpecInvalid(fn: () => unknown, fragment: string): void {
  assertInvalid(fn, ImageSpecParseError, "IMAGE_SPEC_INVALID", fragment);
}

function assertJudgeVerdictInvalid(fn: () => unknown, fragment: string): void {
  assertInvalid(fn, JudgeVerdictParseError, "JUDGE_VERDICT_INVALID", fragment);
}

function assertInvalid<T extends Error>(
  fn: () => unknown,
  errorClass: new (message: string) => T,
  code: string,
  fragment: string,
): void {
  try {
    fn();
  } catch (err) {
    assert(err instanceof errorClass, `expected ${errorClass.name}, got ${formatError(err)}`);
    assert(
      "code" in err && err.code === code,
      `expected code ${code}, got ${String("code" in err ? err.code : "missing")}`,
    );
    assert(
      err.message.includes(fragment),
      `expected message to include ${fragment}, got ${err.message}`,
    );
    return;
  }
  throw new Error(`expected ${errorClass.name}`);
}

function writeEvidence(outcomes: readonly ScenarioOutcome[]): void {
  const lines = [
    "# Image Contracts Smoke",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Scenario | Status | Details |",
    "| --- | --- | --- |",
  ];

  for (const outcome of outcomes) {
    lines.push(
      `| ${outcome.name} | ${outcome.status} | ${outcome.details.map(escapeCell).join("<br>")} |`,
    );
  }

  lines.push(
    "",
    "## Contract Coverage",
    "",
    "- ImageSpec parsing fails closed on malformed shape, unsupported image dimensions, empty strings, empty criteria, invalid tiers, and duplicate criterion ids.",
    "- JudgeVerdict parsing fails closed on malformed shape, inconsistent pass semantics, missing failed-verdict feedback, invalid scores, empty criteria, and duplicate criterion ids.",
    "- Both parsers return normalized contract objects and strip undeclared fields.",
  );

  mkdirSync(dirname(docPath), { recursive: true });
  writeFileSync(docPath, `${lines.join("\n")}\n`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function removeEmptyDir(dir: string): void {
  try {
    rmdirSync(dir);
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String(err.code)
        : "";
    if (code !== "ENOENT" && code !== "ENOTEMPTY") throw err;
  }
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function formatError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
