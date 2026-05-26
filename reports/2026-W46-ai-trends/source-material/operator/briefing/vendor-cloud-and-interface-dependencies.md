# Vendor, cloud, and interface dependencies

## Editorial use

Use this file to cover the dependencies around AI-enabled workflows. The report should note that continuity risk can sit in vendor platforms, hosted services, APIs, EHR interfaces, model endpoints, identity systems, data feeds, or message queues, not only inside the model.

## Source basis

- ONC SAFER Guides include system management and system-interface safety areas in addition to contingency planning.
- ONC contingency-planning material covers planned and unplanned unavailability of all or part of the EHR.
- NIST AI RMF supports mapping third-party, organizational, lifecycle, and deployment-context risk.
- Joint Commission/CHAI responsible-use guidance announcement supports local governance and monitoring adapted to local context.

## Reader-safe claims

- Vendor-hosted AI and embedded AI features should have dependency records: who supplies the service, what data path it uses, what interface it touches, what local workflow depends on it, and who communicates downtime or degraded performance.
- A model can remain unchanged while an API, data feed, identity service, vendor release, message queue, or EHR interface changes the practical reliability of the workflow.
- Contracts, implementation records, and support playbooks can help define notification, fallback, evidence, and escalation expectations, but they do not replace local continuity review.
- Organizations should decide which updates or outages require pausing AI-enabled use, switching to manual mode, or reconciling downstream work.

## Claims to avoid

- Do not claim any named vendor, cloud service, or platform is reliable or unreliable.
- Do not infer contractual rights or obligations without staged contract evidence.
- Do not claim vendor assurance proves local resilience.
- Do not imply all cloud or vendor dependencies are unacceptable.

## Evidence limit

The staged sources support dependency and interface questions. They do not include local architecture diagrams, service-level data, contracts, vendor notices, or outage records.
