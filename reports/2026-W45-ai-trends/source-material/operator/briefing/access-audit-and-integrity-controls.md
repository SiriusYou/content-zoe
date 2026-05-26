# Access, audit, and integrity controls

## Editorial use

Use this file to connect AI action boundaries with ordinary control questions: who can access the workflow, what the AI can read or write, which actions are logged, how changes are attributable, and how unauthorized or unintended changes would be detected. The report should be cautious: these are governance and safeguard questions, not proof of compliance.

## Source basis

- HHS Security Rule materials describe administrative, physical, and technical safeguards for electronic protected health information, including concepts such as access control, audit controls, integrity, and authentication.
- NIST AI RMF supports mapping and managing risks across AI-system context and lifecycle.
- WHO health AI governance guidance supports accountability and protection of affected people.
- Joint Commission/CHAI responsible-use guidance announcement supports local governance, validation, monitoring, and use adapted to context.

## Reader-safe claims

- If an AI feature can read, draft, write, route, or trigger workflow actions, the governance record should ask who or what has permission to do each step.
- Auditability should distinguish between a human action, an AI-generated suggestion, a system-populated field, a vendor-triggered update, and an automated downstream action.
- Access, audit, integrity, and authentication concepts are relevant when AI touches protected workflows, records, messages, queues, or task routing.
- Logs are useful only if they are reviewable by the people responsible for investigation, escalation, and change control.

## Claims to avoid

- Do not claim HIPAA compliance or noncompliance.
- Do not offer legal advice about required safeguards for a specific workflow.
- Do not imply that logs prevent harm or that access controls guarantee privacy or security.
- Do not claim that every AI workflow uses electronic protected health information.

## Evidence limit

The staged sources support asking control and auditability questions. They do not include a local security risk analysis, control test, audit-log sample, incident investigation, or legal opinion.
