# Research Brief

## Scope

Build this week's healthcare AI report as a renewal and continued-use governance piece, not as a market roundup, vendor review, or legal analysis. The working thesis is: healthcare AI should earn its renewal. Continued use should be reviewed against what actually happened in operation, not carried forward because launch was once approved.

This brief applies to both locale outputs (`en`, `zh`). Keep the piece source-bounded, evidence-cautious, and implementation-ready for downstream drafting.

## Recommended angle

- Treat renewal as the next governance checkpoint after launch, scoping, training, monitoring, fallback planning, and use-creep control.
- Frame continued use as a decision, not a default.
- Emphasize comparison between approved use and actual use.
- Tie renewal to support history, dependency change, vendor evidence, and exit readiness.

## H1 direction

- Do not include the week key in the H1.
- Prefer a fresh renewal frame rather than another transparency, intake, fallback, or workload frame.
- Candidate title directions:
  - `Healthcare AI Should Re-Earn Continued Use`
  - `Approval Does Not Carry Forward at Renewal`
  - `Renewal Is Where Healthcare AI Has to Answer Again`

## Required report elements

- Open with the locale-specific leading `EVIDENCE_GRADE_WARN`.
- Include a short `Selected Source Basis` section in each locale.
- Add a section that explains why renewal is different from launch approval.
- Add a section on what should be rechecked in continued use:
  - approved purpose, expected users, expected setting, expected data, downstream effects
  - actual use, overrides, complaints, incident review, workflow burden, downtime, handoffs
  - monitoring signals versus approved-use expectations
- Add a section on changes since launch:
  - model or feature updates
  - interface, data-feed, EHR integration, identity, workflow, support, or protocol changes
- Add a section on vendor evidence and contract checkpoints:
  - change notices, support commitments, updated evidence, audit access, data return or deletion expectations, incident notice, model or feature change notice
- Add a section on decision outcomes:
  - continue, narrow, pause, reopen validation, replace, retire, or prepare transition
- Place the mid-report locale-specific `EVIDENCE_GRADE_WARN` near the renewal-review / vendor-evidence / monitoring discussion.

## Exact evidence warnings to preserve

English leading warning:

`EVIDENCE_GRADE_WARN: This draft is limited to staged procurement, health IT implementation, risk-management, governance, and professional-source material. It does not include local contract terms, utilization logs, performance metrics, incident records, legal analysis, or named implementation proof.`

Chinese leading warning:

`EVIDENCE_GRADE_WARN: 本草稿仅限于已暂存的采购、健康 IT 实施、风险管理、治理和专业资料。不包含本地合同条款、使用日志、性能指标、事件记录、法律分析或具名实施证明。`

English mid-report warning:

`EVIDENCE_GRADE_WARN: Renewal review, vendor evidence requests, monitoring records, support checks, and contract checkpoints can make continued use more reviewable, but they do not prove safety, compliance, fairness, cybersecurity readiness, patient trust, outcome improvement, or operational maturity.`

Chinese mid-report warning:

`EVIDENCE_GRADE_WARN: 续约审查、供应商证据请求、监测记录、支持检查和合同检查点可以让持续使用更可审查，但不能证明安全性、合规性、公平性、网络安全就绪度、患者信任、结果改善或运营成熟度。`

## Safe claims to use

- Renewal should ask whether the tool is still being used for the reviewed purpose, in the reviewed setting, by the reviewed users.
- Continued use should be checked against actual use, monitoring signals, support history, training state, scope changes, fallback readiness, ownership, and unresolved concerns.
- Monitoring should compare actual use with approved use, not only output quality.
- A workflow may need renewed review even if the visible tool name is unchanged, because dependencies, interfaces, support, or workflow changed.
- Vendor assurances are inputs to local review, not substitutes for local governance.
- Renewal can end in continuation, narrowing, pause, reopened validation, replacement, retirement, or transition planning.
- Exit readiness makes continued use more reviewable because it shows the organization is not locked into default renewal.

## Claims to avoid

- Do not claim any product, vendor, hospital, or health system should or should not renew.
- Do not claim renewal review proves safety, effectiveness, compliance, fairness, cybersecurity readiness, patient trust, outcome improvement, or operational maturity.
- Do not imply contract terms alone solve workflow, privacy, security, clinical, or vendor-dependency risk.
- Do not give legal advice about contracts, FDA, ONC, HIPAA, malpractice, procurement, cybersecurity, or professional liability.
- Do not invent local metrics, incidents, complaints, support quality, outage history, or renewal outcomes.
- Do not imply every healthcare AI workflow needs the same renewal cadence.

## Evidence limits to state plainly

- No local contract terms are available.
- No utilization logs, performance metrics, incident records, complaint records, or measured outcomes are available.
- No local support-ticket history, outage records, release notes, architecture diagrams, or vendor notices are available.
- No named implementation proof or legal analysis is available.

## Suggested section logic

1. Renewal is a governance checkpoint, not a rubber stamp.
2. Continued use should be tested against actual use, not launch assumptions alone.
3. Support history, dependency change, and vendor evidence can change the renewal picture.
4. Decision records should name the evidence, gaps, owner, next review date, and early-review triggers.
5. Exit readiness matters because renewal should remain reversible.

## Selected source basis to reflect in the report

- ONC / HealthIT.gov materials on selecting, upgrading, implementing, and contracting health IT
- NIST AI RMF lifecycle, monitoring, and third-party risk framing
- Joint Commission / CHAI responsible-use governance framing
- WHO accountability, oversight, and protection framing
- AMA workflow, training, accountability, privacy, and professional responsibility framing

## Source gaps for downstream drafting

If a section starts to sound like a proof claim, add a constraint sentence. The staged material supports governance questions and review checkpoints. It does not support named examples, comparative vendor claims, local operational conclusions, or claims that the renewal process itself works.
