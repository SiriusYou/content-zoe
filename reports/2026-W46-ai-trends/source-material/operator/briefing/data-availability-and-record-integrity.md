# Data availability and record integrity

## Editorial use

Use this file to connect continuity with data availability and reconciliation. The draft should treat records, messages, queues, and task status as operational evidence that can become incomplete or inconsistent during downtime or degraded operation.

## Source basis

- HHS Security Rule and summary materials include concepts of availability, integrity, access control, audit controls, backup, disaster recovery, emergency-mode operation, and criticality analysis for electronic protected health information.
- HHS ransomware guidance connects contingency planning with backup, disaster recovery, emergency operations, criticality analysis, and testing.
- ONC SAFER Guides include system management, system interfaces, patient identification, orders and decision support, test results follow-up, and clinician communication as safety-relevant health IT areas.
- NIST AI RMF supports attention to reliability, validity, lifecycle monitoring, and context-specific risks.

## Reader-safe claims

- AI fallback planning should ask which records, queues, messages, summaries, task states, or source data might be missing, delayed, duplicated, stale, or inconsistent during degraded operation.
- Recovery is not only restoring access; it also includes deciding what changed during downtime and what needs reconciliation.
- If a workflow depends on AI-generated summaries, task routing, alerts, or record population, the organization should decide how to detect gaps after the service returns.
- Auditability and integrity checks can help make downtime and recovery reviewable, but they do not prove safety or compliance.

## Claims to avoid

- Do not claim HIPAA compliance or noncompliance.
- Do not imply backups alone preserve workflow meaning or clinical context.
- Do not claim restored data is complete, current, or clinically usable without review.
- Do not claim AI downtime automatically creates a privacy or security incident.

## Evidence limit

The staged sources support questions about availability, integrity, criticality, and reconciliation. They do not include local control tests, audit logs, data-loss evidence, or legal conclusions.
