# Image Contracts Smoke

Generated: 2026-05-28T18:53:05.313Z

| Scenario | Status | Details |
| --- | --- | --- |
| valid-spec-roundtrip-strips-extra-fields | PASS | Valid ImageSpec parsed, normalized, and stripped unknown fields. |
| spec-input-non-object-or-array | PASS | Null, primitive, and array spec inputs fail closed. |
| spec-missing-subject | PASS | Missing subject is rejected. |
| spec-whitespace-required-string | PASS | Whitespace-only required string is rejected. |
| spec-palette-not-array | PASS | Non-array palette is rejected. |
| spec-palette-empty-string | PASS | Empty palette entry is rejected. |
| spec-negative-constraints-not-array | PASS | Non-array negativeConstraints is rejected. |
| spec-negative-constraints-empty-string | PASS | Empty negativeConstraints entry is rejected. |
| spec-dimensions-non-number | PASS | Non-number dimensions are rejected. |
| spec-dimensions-non-positive-or-non-integer | PASS | Zero, negative, and non-integer dimensions are rejected. |
| spec-dimensions-unsupported-preset | PASS | Unsupported positive dimensions are rejected. |
| spec-acceptance-empty-array | PASS | Empty acceptance criteria are rejected. |
| spec-acceptance-invalid-tier | PASS | Invalid acceptance criterion tier is rejected. |
| spec-acceptance-whitespace-id-or-description | PASS | Whitespace criterion id and description are rejected. |
| spec-acceptance-duplicate-id-after-trim | PASS | Duplicate acceptance ids after trimming are rejected. |
| valid-verdict-roundtrip-strips-extra-fields | PASS | Valid JudgeVerdict parsed, normalized, and stripped unknown fields. |
| valid-verdict-feedback-absent-when-pass | PASS | Passing verdict accepts missing regenerateFeedback. |
| verdict-input-non-object-or-array | PASS | Null, primitive, and array verdict inputs fail closed. |
| verdict-missing-overallPass | PASS | Missing overallPass is rejected. |
| verdict-criteria-empty-array | PASS | Empty verdict criteria are rejected. |
| verdict-criteria-pass-non-boolean | PASS | Non-boolean criterion pass is rejected. |
| verdict-criterion-whitespace-id-or-rationale | PASS | Whitespace verdict criterion id and rationale are rejected. |
| verdict-score-non-number-or-non-finite | PASS | Non-number, NaN, and Infinity scores are rejected. |
| verdict-duplicate-criterion-id-after-trim | PASS | Duplicate verdict ids after trimming are rejected. |
| verdict-overall-pass-inconsistent-with-criterion | PASS | overallPass must match every criterion pass value. |
| verdict-failed-without-feedback | PASS | Failed verdicts require corrective regenerateFeedback. |
| verdict-feedback-non-string-or-empty | PASS | Invalid regenerateFeedback values are rejected. |

## Contract Coverage

- ImageSpec parsing fails closed on malformed shape, unsupported image dimensions, empty strings, empty criteria, invalid tiers, and duplicate criterion ids.
- JudgeVerdict parsing fails closed on malformed shape, inconsistent pass semantics, missing failed-verdict feedback, invalid scores, empty criteria, and duplicate criterion ids.
- Both parsers return normalized contract objects and strip undeclared fields.
