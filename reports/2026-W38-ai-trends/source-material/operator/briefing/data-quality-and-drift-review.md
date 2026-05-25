# Data quality and drift review

## Editorial use

Use this file to emphasize that data quality and drift are not purely technical concerns. They become governance issues when they affect who is represented, which workflows are distorted, and whether a tool's assumptions still match the local environment.

## Source basis to cite cautiously

- NIST AI RMF supports mapping data context, measuring risk, and managing performance or validity over time.
- ONC/HealthIT transparency concepts support documenting data sources, intended use, and recommendation context.
- FDA lifecycle and change-control materials support the bounded lesson that model behavior and operating conditions can change after initial review.
- WHO and OECD governance principles support fairness, accountability, transparency, and risk-based monitoring.

## Supported claims

- Data drift review should ask whether patient mix, coding practices, documentation workflows, vendor updates, or care pathways have changed enough to affect model behavior.
- Data quality work should be linked to operational decisions, not left as background analytics.
- Monitoring can reveal when the original evidence base is no longer enough for local use.

## Unsafe claims

- Do not claim drift monitoring proves fairness or safety.
- Do not infer local model performance from framework language.
- Do not state that a particular AI tool has drifted unless direct evidence is staged.

## Evidence warning

The staged sources support data quality and drift review as governance duties. They do not provide a measured drift signal for any deployment.
