# Healthcare AI Needs a Front Door

<!-- EVIDENCE_GRADE_WARN: This report is limited to staged governance, regulatory-routing, and third-party-risk source material. It does not include local inventory evidence, deployment evidence, outcome data, or named case proof. -->

Healthcare AI governance begins before formal approval. Before an organization can validate, monitor, disclose, or retire an AI-enabled workflow, it first has to identify the use case, classify the tool, route it to the right review path, assign a local owner, and define what evidence is required before staff rely on it.

That is the front-door problem. An organization cannot govern AI it has not identified, and it cannot review responsibly if every tool is treated as the same kind of case. Intake is therefore an operating layer, not a final verdict. It creates a structured starting point for routing and accountability without claiming that a tool is safe, effective, compliant, fair, or operationally mature.

## What an intake record should capture

A useful intake record can stay plain-language while still being operational. At minimum, it should answer:

- What is the tool or feature?
- Who will use it, and who may be affected by its outputs?
- What workflow does it touch?
- What decision, task, or documentation step does it influence?
- What data does it use, and how does it gain access?
- Who built it, supplies it, embeds it, or updates it?
- What human review is expected before people act on its outputs?
- Who owns the use case locally, and where does escalation go?

Those fields matter because healthcare AI often arrives as a workflow change before it arrives as a governance label. A documentation assistant, scheduling feature, patient-facing chatbot, locally built analytics model, or vendor-supplied decision support tool may look different on paper, but each can change how work gets done. Intake makes those changes visible early enough for the organization to ask the next question: what kind of review does this case require?

## Classification comes before routing

Different categories of healthcare AI raise different review questions. A regulated AI-enabled medical device, a certified health IT predictive decision support intervention, an ambient documentation feature, an administrative automation tool, and a locally built model should not all move through the same path as if they posed the same issues.

That is why classification has to happen before review-path assignment. The intake step should ask what category the tool appears to fit, what intended use is being claimed locally, and where uncertainty remains. If the regulatory category or workflow impact is unclear, the record should preserve that uncertainty and route the case for qualified review rather than smoothing it over.

Public device-list entries, certification materials, source attributes, and vendor disclosures can help route a case, but they are only routing signals. They do not substitute for local review of intended use, workflow fit, user behavior, monitoring needs, or evidence expectations.

<!-- EVIDENCE_GRADE_WARN: Intake records, device-list entries, source attributes, and vendor disclosures can help route review, but they do not prove local safety, effectiveness, compliance, or operational maturity. -->

The governance point is narrow but important: classification determines which questions must be asked. It does not prove that any answer is sufficient.

## Discovery cannot stop at formal AI projects

An intake front door is only useful if it looks beyond tools that arrive with an obvious AI label. In healthcare, AI can enter through procurement, EHR configuration, vendor updates, cloud tools, outsourced workflows, analytics platforms, productivity software, and individual user behavior. By the time a governance team hears about a feature formally, that feature may already be shaping documentation, patient communication, billing, scheduling, triage, or operational decisions.

This is why intake should include both direct and indirect entry paths:

- New products purchased as AI-enabled tools
- Existing vendor products that add AI capabilities through updates
- EHR or certified health IT features configured locally
- Outsourced services that use AI inside a contracted workflow
- Departmental pilots and locally built models
- Individual or team use of general-purpose tools that shape real work

The goal is not to claim a complete inventory. The goal is to stop governance from depending on informal knowledge held by one department, one vendor manager, or one enthusiastic adopter. Intake creates a repeatable way to ask whether AI is already mediating work that matters.

For third-party or embedded tools, the record should also capture questions that matter later: vendor role, data access path, permitted use, model-update notification, audit rights, incident notification, output review expectations, and renewal-time performance review. Those details help an organization route review and define accountability even when the AI capability is not locally built.

## Intake is incomplete without ownership

An intake record is not complete if it names the tool but not the people responsible for it. Governance becomes operational only when the record identifies the local owner, the clinical or operational sponsor, the affected user group, and the route for escalation.

That ownership layer matters because review questions are usually cross-functional. Clinical leadership, IT, compliance, privacy, security, procurement, data governance, quality, and patient-safety teams may each hold part of the answer. Intake should make clear who can narrow intended use, require additional evidence, pause a pilot, question continued reliance, or revisit a prior approval when conditions change.

Ownership should also survive handoff. A tool does not stop needing governance when procurement closes or a pilot launches. If nobody owns the use case once it enters a live workflow, monitoring and escalation have no durable anchor.

## The front door should define the next checkpoints

Intake matters because it sets the baseline for what happens next. A stronger intake record should not just describe the tool; it should define the downstream checkpoints that later governance depends on:

- What must be reviewed before use
- What evidence is needed before reliance
- What human review is expected in practice
- What should be monitored after deployment
- What vendor or product changes require notification
- What downtime, fallback, or workaround expectations exist
- What conditions should trigger escalation or reconsideration

This is where intake connects to validation, monitoring, and eventual exit without pretending those functions are already strong. If the tool changes, underperforms, loses vendor support, or no longer fits the workflow, intake gives the organization a baseline: what the tool was supposed to do, under what assumptions, for which users, with what owner, and with which review conditions attached.

## What this draft does not prove

<!-- EVIDENCE_GRADE_WARN: This report makes a governance-operating argument, not a safety claim. The staged sources support intake as the front door for routing and accountability, but they do not establish complete local inventory, effective governance execution, quantified shadow-AI prevalence, deployment outcomes, or named case proof. -->

This report makes a governance-operating argument, not a safety claim. The staged sources support intake as the front door for routing and accountability, but they do not prove:

- Any local organization has a complete AI inventory or an audited registry
- Any reviewed tool is safe, effective, compliant, fair, or trustworthy
- Any governance body executes review, monitoring, or escalation well
- Any quantified prevalence of shadow AI or vendor risk
- Any deployment outcome, implementation success story, or named case proof

That limitation is not incidental. It is the point of the front-door frame. Intake is the step that makes later review and follow-through possible. Without it, healthcare AI governance starts too late.
