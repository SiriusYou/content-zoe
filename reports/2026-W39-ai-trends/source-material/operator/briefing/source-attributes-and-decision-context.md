# Source attributes and decision context

## Editorial use

Use this file to connect data lineage to clinical decision context. Source attributes are useful when they help users understand the origin, scope, limitations, and intended use of AI-enabled recommendations. They are not useful if they become decorative metadata disconnected from workflow decisions.

## Source basis to cite cautiously

- ONC/ASTP HTI-1 decision-support intervention requirements support source attributes, transparency, and information sharing for predictive decision support in certified health IT.
- NIST AI RMF supports mapping context, measuring risk, documenting assumptions, and managing risk over an AI system lifecycle.
- FDA predetermined change control plan guidance for AI-enabled device software functions supports bounded change plans, transparency, monitoring, and evidence across the total product lifecycle in regulated device contexts.
- CHAI assurance guidance supports evidence collection around intended use, data, performance, monitoring, and accountability.

## Supported claims

- Source attributes can make AI-mediated recommendations more inspectable by linking users to data provenance, intended-use boundaries, validity limits, and review responsibilities.
- Decision context matters: the same model output can carry different risk depending on workflow, patient population, downstream action, and escalation route.
- Metadata should be tied to governance decisions, such as when to monitor, when to pause use, when to ask for vendor evidence, and when to update training.

## Unsafe claims

- Do not claim source attributes prove accuracy, fairness, or local fit.
- Do not imply FDA device lifecycle concepts apply automatically to all healthcare AI tools.
- Do not claim an organization has operationalized source attributes unless staged evidence says so.

## Evidence warning

The staged sources support source attributes and decision context as trust-building mechanisms. They do not prove that any implementation is valid, fair, safe, or locally appropriate.
