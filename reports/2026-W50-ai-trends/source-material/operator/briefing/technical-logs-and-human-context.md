# Technical logs and human context

## Editorial use

Use this file to prevent a narrow log-only version of the report. The report should argue that technical traces are useful but incomplete unless joined to the human workflow context around the event.

## Source basis

- ONC Decision Support Interventions material supports visibility into source attributes, logic, references, and implementation information.
- NIST AI RMF supports documentation, monitoring, measurement, context mapping, and risk response.
- AMA augmented-intelligence material supports attention to workflow, accountability, training, privacy, cybersecurity, and professional responsibility.

## Reader-safe claims

- Technical logs can help show what the system displayed, when it displayed it, what data or source attributes were available, and whether the workflow produced an alert, recommendation, score, note, or handoff.
- Human context can show what the user understood, what the patient path required, whether a fallback existed, whether an override occurred, and whether the event was caught before patient impact.
- A useful incident file should preserve both views because either one alone can mislead.
- The record should distinguish model behavior, integration behavior, user-interface behavior, data-feed behavior, and workflow behavior when the evidence allows.
- Privacy, security, and minimum-necessary handling should remain part of local record design.

## Claims to avoid

- Do not claim logs alone prove what happened clinically.
- Do not claim user narratives alone prove model behavior.
- Do not expose patient-identifying details.
- Do not invent log fields, audit records, source attributes, or interface screenshots.

## Evidence limit

The staged sources support technical and workflow-context questions. They do not include local logs, screenshots, audit trails, patient records, user interviews, privacy review, or cybersecurity review.
