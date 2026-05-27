# Research Brief

## Scope

- Topic: AI in healthcare - weekly
- Publication frame: W53 year-boundary handoff, not a rollover into 2027-W01
- Core angle: healthcare AI governance should not reset at the calendar boundary
- Primary artifact: the carry-forward file that keeps unfinished governance work visible across review cycles
- Audience: healthcare leaders, clinical informatics teams, operational owners, safety leaders, privacy/security partners, and governance groups

## Core Thesis

The report should argue that a carry-forward file is a practical governance-continuity tool for healthcare AI at year-end. It should preserve unresolved reviews, open conditions, owner follow-up, monitoring and evidence gaps, change debt, near-miss threads, fallback questions, and retirement decisions so they remain reviewable in the next cycle.

## What The Report Should Say

- A carry-forward file is a continuation surface linked to the local inventory or register, not a replacement for it.
- The year boundary creates a visibility risk: items that were open in one review cycle can disappear from attention in the next unless they are explicitly carried forward.
- Useful open-item categories include pending review, unresolved conditions, unreviewed monitoring evidence, unresolved validation triggers, incomplete source attributes, recent unreconciled changes, near misses, fallback gaps, and unresolved retirement or replacement questions.
- Useful fields include workflow, owner, status, last review, next review trigger, open decision, evidence gap, monitoring gap, recent change, near-miss or incident link, fallback status, retirement state, and escalation path when those records exist.
- Unknowns should stay visible as unknowns rather than being converted into assumed approval, owner confirmation, validation, or monitoring coverage.
- Reconciliation should link every open carry-forward item back to a workflow or register entry when one exists and should look across embedded or indirect AI-enabled workflows, not only standalone tools.
- Monitoring notes, change records, user concerns, incidents, and near misses should inform the next review cycle when those records exist, but the report must not invent local counts or events.
- Retired, replaced, narrowed, or paused workflows may still need visibility when dependencies, stored output, fallback readiness, communication, or unresolved review threads remain open.

## Operating Concepts To Use

- "Carry-forward file" as the year-boundary handoff artifact
- "Open-item continuity" as the governance objective
- "Change debt" as review work created by change but not yet closed
- "Owner confirmation" and "expiring decisions" for approvals or conditions that should not silently continue
- "Retire or archive" as a valid next action when active use has ended but governance-relevant questions remain

## Draft Structure

1. Open with the evidence warning and a clear statement that the piece is a governance-continuity argument, not a factual survey of local year-end reviews.
2. Explain why the calendar boundary is a governance hazard for unfinished AI work.
3. Define the carry-forward file and distinguish it from the inventory or register.
4. Walk through the kinds of items that should remain visible across the year boundary.
5. Explain reconciliation against the inventory, including embedded and indirect AI-enabled workflows.
6. Cover monitoring history, change debt, incidents, near misses, and owner follow-up.
7. Address expiring decisions plus retirement, replacement, pause, or narrowing states.
8. Include a short "Selected Source Basis" section.
9. Re-state that visibility improves review continuity but does not prove safety, compliance, fairness, effectiveness, trust, outcomes, or maturity.

## Required Warnings And Style Constraints

- Preserve explicit `EVIDENCE_GRADE_WARN` comments in both locales.
- Use the staged warning posture: one leading warning and one mid-report warning.
- Keep the warnings locale-pure: English warning prose only in `report.en.md`, Chinese warning prose only in `report.zh.md`.
- Do not put the week key in the H1 title.
- Prefer the title `Healthcare AI Needs a Carry-Forward File` unless a clearly stronger source-bounded variant emerges.
- Include a short `Selected Source Basis` section in both locales.
- Target roughly 75-95 markdown lines per locale.

## Claims To Avoid

- Do not claim any named hospital, health system, vendor, or product has or lacks a year-end carry-forward process.
- Do not say a carry-forward file, inventory, dashboard, committee packet, or annual review proves safety, compliance, effectiveness, fairness, continuity, patient trust, outcome improvement, resilience, or maturity.
- Do not give legal advice or convert open items into findings of noncompliance, negligence, or unsafe practice.
- Do not invent local owners, due dates, committee structures, incident counts, validation results, utilization trends, or audit findings.
- Do not present FDA AI/ML-enabled device context as the whole healthcare AI landscape.

## Source Gaps To Keep Explicit

- No local committee minutes, inventory exports, validation packets, procurement records, audit logs, utilization data, or named implementation proof are available in this attempt directory.
- The staged pack supports governance questions and a cautious operating frame, not empirical claims about actual year-end review performance.

## Implementation Notes For Downstream Drafting

- Build from the prior inventory frame without repeating an inventory-first article.
- Keep the report practical: emphasize fields, review questions, and next-action categories.
- Treat "continue," "narrow," "pause," "retire," "replace," "reopen review," and "request evidence" as possible next actions, not universal requirements.
- If the draft needs examples, use generic workflow categories only, such as EHR modules, documentation, imaging support, triage, referral routing, scheduling, billing, coding, prior authorization support, analytics, quality reporting, and operations queues.
