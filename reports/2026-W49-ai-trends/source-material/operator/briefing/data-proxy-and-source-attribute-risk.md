# Data proxy and source attribute risk

## Editorial use

Use this file to explain why source attributes and data provenance matter without overstating what they prove. The report should treat demographic variables, proxy variables, missing data, and source attributes as review inputs that can reveal risk, not as automatic fairness controls.

## Source basis

- ONC Decision Support Interventions material supports attention to source attributes, intervention logic, references, evidence, and implementation information for health IT decision support.
- NIST AI RMF supports data, design, deployment context, measurement, and monitoring as parts of risk management.
- eCFR 45 CFR 92.210 identifies patient care decision support tool risk in relation to input variables or factors that measure protected characteristics. Keep the report non-legal and source-bounded.

## Reader-safe claims

- Source attributes can help reviewers see what evidence, data, logic, or assumptions sit behind a decision-support workflow.
- Data elements can operate as proxies for access, geography, income, race, language, disability, age, or care fragmentation even when a model does not directly use those labels.
- Missing data can create equity risk when some patients have fewer records, less consistent access, limited portal use, language barriers, disability-related documentation gaps, or care outside the connected network.
- Source-attribute review should ask what data are used, why they are used, where they came from, when they were last updated, and who can challenge an error.
- If the review cannot see the relevant variables, proxies, or missingness patterns, that evidence gap should remain explicit.

## Claims to avoid

- Do not claim source attributes prove fairness or compliance.
- Do not claim removal of protected-class variables removes bias.
- Do not claim inclusion of protected-class variables automatically creates unlawful use.
- Do not make legal conclusions about a patient care decision support tool.
- Do not invent datasets, coefficients, performance values, or subgroup results.

## Evidence limit

The staged sources support questions about source attributes, data provenance, proxy risk, and missingness. They do not contain a local model card, training data inventory, validation report, demographic analysis, or legal review.
