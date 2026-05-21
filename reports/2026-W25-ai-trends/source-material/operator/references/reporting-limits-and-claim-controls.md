# Reporting limits and claim controls

This file defines claim boundaries for the Phase 4.42 trial-publication source set.

Allowed claim classes:

- FDA has a public AI-enabled medical-device list and describes the list as a transparency resource.
- FDA digital health guidance activity includes AI-enabled device software functions, clinical decision support, cybersecurity, and software policy.
- HHS frames AI as both innovation/implementation and governance/public-trust work.
- Joint Commission/CHAI guidance signals health-system interest in internal governance, local validation, monitoring, and appropriate use.
- Healthcare AI governance is best described as layered: device oversight, federal agency governance, and provider self-governance are related but distinct.

Claims that require explicit limitation language:

- market size, funding volume, or vendor rankings;
- hospital or payer adoption rates;
- clinical outcome improvements;
- claims that all healthcare AI is FDA-regulated;
- claims that Joint Commission/CHAI guidance is mandatory regulation;
- claims that the staged sources are comprehensive.

Suggested evidence-limit language:

- "This report is based on official and standards-adjacent governance sources, not a comprehensive market dataset."
- "The evidence supports regulatory and governance direction, not market-share or deployment-rate estimates."
- "Medical-device AI and health-system administrative/content AI operate under different oversight layers."

Editorial pass/fail guard:

- If the generated report makes broad commercial, clinical-performance, or adoption claims without a staged source or explicit limitation, Phase 4.42 should take the `report quality weak -> no publish` branch.
