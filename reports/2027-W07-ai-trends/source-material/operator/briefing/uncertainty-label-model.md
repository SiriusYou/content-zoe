# Uncertainty label model

## Core idea

An uncertainty label is a short reader-facing note attached to an AI-enabled output. It explains what the output is based on, what it leaves out, what context may change interpretation, and what should happen when the uncertainty matters.

The article should avoid reducing this to a numerical confidence score. A score may be one signal, but the governance question is broader: can the intended reader understand the output's limits well enough to decide whether to review, use a fallback route, escalate, or pause before acting?

## Fields an uncertainty label can include

- output purpose;
- intended user;
- decision point;
- evidence basis;
- missing context;
- confidence qualifier;
- known limitation;
- last review signal;
- review trigger;
- fallback route;
- escalation route;
- owner group.

These fields are useful only when they help readers route action. A label that is too vague can become decorative. A label that looks precise without local evidence can create false confidence.

## What the label does not prove

An uncertainty label is not proof of safety, compliance, effectiveness, fairness, patient trust, outcome improvement, local validation, or operational maturity. It is a way to make limits and review needs easier to see.
