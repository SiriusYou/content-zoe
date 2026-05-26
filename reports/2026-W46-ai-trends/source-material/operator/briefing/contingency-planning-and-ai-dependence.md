# Contingency planning and AI dependence

## Editorial use

Use this file to make W46 about continuity rather than launch governance. The report should argue that an AI-enabled workflow is not operationally ready unless the organization knows what happens when the tool, data feed, interface, EHR capability, model service, or vendor platform becomes unavailable or unreliable.

## Source basis

- ONC 2025 SAFER Guides include contingency planning for planned or unplanned EHR unavailability.
- ONC SAFER contingency material frames downtime as a safety issue because clinicians or end users may lose access to all or part of the EHR.
- HHS Security Rule materials include contingency planning concepts for systems containing electronic protected health information, including backup, disaster recovery, emergency-mode operation, testing, revision, and criticality analysis.
- NIST AI RMF supports mapping context, dependencies, and lifecycle risk before managing AI risk.

## Reader-safe claims

- AI dependence should be mapped before deployment: what work depends on the AI output, what upstream data it needs, what downstream tasks it touches, and what users lose when it is unavailable.
- Continuity review should cover both planned downtime and unplanned disruption.
- A fallback plan should distinguish between AI unavailability, EHR unavailability, interface failure, data-feed delay, vendor-service degradation, and intentional pause.
- Criticality matters. A scheduling assistant, documentation summarizer, triage flag, order-related decision support tool, and patient-facing message assistant have different downtime consequences.

## Claims to avoid

- Do not claim contingency planning proves safe care or business continuity.
- Do not imply every AI disruption is an EHR downtime event.
- Do not claim HHS or ONC materials provide legal advice for a specific AI workflow.
- Do not claim that a local organization has tested fallback unless staged evidence shows it.

## Evidence limit

The staged sources support continuity and dependency questions. They do not include local downtime drills, recovery-time objectives, incident reports, measured care delays, or patient outcome evidence.
