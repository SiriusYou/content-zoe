# Missing context and review triggers

## Missing context

Healthcare AI outputs can depend on context that may not be visible to the model or the reader. The relevant context might include patient-specific facts, workflow timing, intended user, setting, downstream action, source freshness, data completeness, or local policy.

The article should treat missing context as a reason to make review questions visible. It should not imply that every missing field makes the output wrong or unsafe.

## Review triggers

A review trigger is a condition that tells the reader when the output should not be treated as routine. Examples can include missing inputs, outdated source information, unexpected result, high-impact downstream action, mismatch with observed workflow, repeated override, unclear owner, or unavailable fallback route.

These examples are governance prompts, not clinical instructions. The article should keep them source-bounded.

## Reader value

The reader-facing point is practical: a label that says "review when these conditions appear" is more useful than a label that says only "AI-generated" or "low confidence" without routing the next step.
