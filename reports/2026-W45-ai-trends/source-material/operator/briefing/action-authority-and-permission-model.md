# Action authority and permission model

## Editorial use

Use this file to make W45 about what an AI-enabled workflow is allowed to do. The report should argue that responsible operation requires permission boundaries: which actions the tool may perform, which actions it may only prepare, which outputs remain recommendations, and which downstream steps require explicit human authorization.

## Source basis

- NIST AI RMF supports mapping the context, actors, uses, and impacts of an AI system before managing risk.
- WHO health AI governance guidance supports accountability, human autonomy, and context-sensitive governance.
- AMA augmented-intelligence materials frame AI as assistive and connect responsible use with oversight, transparency, privacy, cybersecurity, physician responsibility, and practical implementation.
- Joint Commission/CHAI responsible-use guidance announcement points to policies, local validation, monitoring, and use that organizations can adapt to context.

## Reader-safe claims

- A permission model should separate suggestion, drafting, queueing, routing, record population, notification, scheduling, ordering, and other downstream actions.
- The same AI output can have a different governance meaning depending on whether it is passive text, a prefilled field, a patient-facing message, a work-queue change, or a trigger for another process.
- Governance should name the local owner for each action class and define who can approve, reject, override, pause, or escalate the workflow.
- The permission boundary should be reviewed when the model changes, the interface changes, the tool gains new actions, the vendor changes release behavior, or local workflow conditions shift.

## Claims to avoid

- Do not claim the staged sources prove that any AI workflow can act autonomously.
- Do not claim that every drafted or suggested action has the same risk.
- Do not imply that a permission model alone proves safety, compliance, or trust.
- Do not say the sector has a mature, uniform permission model for healthcare AI.

## Evidence limit

The staged sources support governance questions about authority, role clarity, and contextual risk. They do not include local role-permission tests, audit logs, user-behavior evidence, safety outcomes, or legal determinations.
