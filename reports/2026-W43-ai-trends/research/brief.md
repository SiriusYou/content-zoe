# Healthcare AI Needs a Front Door

## Thesis

This report should argue one bounded point: healthcare AI governance starts with intake. Before an organization can validate, monitor, disclose, or retire an AI-enabled workflow, it has to identify the use case, classify what kind of tool it is, route it to the right review path, assign a local owner, and record what evidence is needed before reliance.

This is a governance-operating argument, not a safety claim. The staged material supports intake as the front door for routing and accountability, but it does not prove local safety, effectiveness, compliance, operational maturity, or complete AI discovery.

## Required evidence posture

`EVIDENCE_GRADE_WARN: This draft is limited to staged governance, regulatory-routing, and third-party-risk source material. It does not include local inventory evidence, deployment evidence, outcome data, or named case proof.`

`EVIDENCE_GRADE_WARN: 本草稿仅限于已暂存的治理、监管路由和第三方风险资料。不包含本地清单证据、部署证据、结果数据或具名案例证明。`

Use a second warning near any discussion of intake records, device lists, source attributes, certification signals, or vendor disclosures:

`EVIDENCE_GRADE_WARN: Intake records, device-list entries, source attributes, and vendor disclosures can route review, but they do not prove local safety, effectiveness, compliance, or operational maturity.`

`EVIDENCE_GRADE_WARN: 接入记录、设备清单条目、来源属性和供应商披露可以帮助路由审查，但不能证明本地安全性、有效性、合规性或运营成熟度。`

## Core points to deliver

- Intake is a first operating layer, not the same as approval.
- Intake should surface both obvious AI products and embedded or third-party capabilities that can enter through procurement, EHR configuration, vendor updates, cloud tools, outsourced workflows, or individual user behavior.
- Classification should happen before review-path assignment. Device software, certified-health-IT decision support, administrative automation, ambient documentation, scheduling tools, and locally built analytics models do not all raise the same questions.
- Intake should record uncertainty instead of smoothing it over. If regulatory category or workflow impact is unclear, the case should be routed for qualified review.
- Intake is incomplete without accountable ownership. The record should name the local owner, sponsor, affected user group, and escalation route, and it should clarify who can narrow intended use, require more evidence, pause use, or revisit approval.
- Intake should also define downstream checkpoints: what must be reviewed before use, what must be monitored after use, what change notifications matter, and what conditions should trigger escalation or reconsideration.

## Recommended structure for the report draft

1. Open with the front-door problem: organizations cannot govern AI they have not identified and classified.
2. Make intake concrete with a plain-language register: tool, users, workflow, influenced decision or task, data used, supplier or builder, local owner.
3. Explain routing: different categories of healthcare AI need different evidence and review questions; public device or certification signals can help, but they are incomplete.
4. Expand discovery beyond formal AI projects: third-party, embedded, and shadow AI can alter documentation, patient communication, scheduling, billing, triage, and operations before governance teams notice.
5. Close on accountable follow-through: intake creates the baseline for validation, monitoring, escalation, and eventual exit, without claiming those later steps are already strong.

## Concrete intake fields to emphasize

- Intended use and affected workflow
- Primary user group and who is affected by outputs
- Decision, task, or documentation step influenced
- Data sensitivity and data access path
- Supplier, builder, or third-party role
- Regulatory or governance category, if known
- Human review expectations
- Local owner and escalation path
- Pre-use evidence needed
- Post-deployment monitoring signals
- Change-notification and fallback expectations

## Claims to avoid

- Do not say intake proves safety, effectiveness, fairness, compliance, privacy, cybersecurity readiness, clinical benefit, or trust.
- Do not imply every healthcare AI tool is FDA-regulated or every decision-support tool is an ONC-covered predictive DSI.
- Do not treat device-list entries, certification artifacts, source attributes, model cards, contracts, or vendor disclosures as proof of local performance or maturity.
- Do not claim any hospital, vendor, or product succeeded or failed; the staged sources do not provide named-case proof.
- Do not present legal advice on FDA, ONC, HIPAA, procurement, or contract obligations.

## Source gaps to state plainly

- No local inventory or audited registry evidence
- No deployment or outcome data
- No quantified prevalence of shadow AI or vendor risk
- No proof that any governance body executes review, monitoring, or escalation well
- No basis for a weekly market roundup, product ranking, or implementation success story
