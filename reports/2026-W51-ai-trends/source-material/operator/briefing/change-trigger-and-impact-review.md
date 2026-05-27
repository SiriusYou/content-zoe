# Change trigger and impact review

## Editorial use

Use this file to explain what should trigger a deeper review. The report should show that the issue is not only whether code changed, but whether the change touches clinical context, workflow, patient path, data, or fallback behavior.

## Source basis

- ONC SAFER System Management and Contingency Planning support attention to configuration, maintenance, interfaces, downtime, recovery, and fallback operations.
- ONC Decision Support Interventions material supports visibility into logic, source attributes, and implementation information.
- NIST AI RMF supports mapping risks to context and measuring/managing changes over the lifecycle.

## Reader-safe claims

- A change can be material even when the model name stays the same.
- Review triggers can include new data feeds, changed thresholds, changed prompts, changed source attributes, interface redesigns, integration changes, user-role changes, new settings, changed escalation paths, vendor dependency changes, or changed downtime/fallback behavior.
- The impact review should ask who sees the change, who acts on it, what patient pathway it touches, and what decisions or documentation it may influence.
- A small technical change can create a large workflow change if it shifts timing, handoffs, user interpretation, or escalation.
- An update can reopen questions from prior reviews: approved use, renewal, equity, near misses, monitoring, and exit readiness.

## Claims to avoid

- Do not claim every change is material.
- Do not claim the staged sources define universal materiality thresholds.
- Do not give legal or device-regulatory conclusions.
- Do not invent local change-impact findings.

## Evidence limit

The staged sources support impact-review questions. They do not include local architecture diagrams, interface maps, workflow observations, change tickets, downtime records, or legal review.
