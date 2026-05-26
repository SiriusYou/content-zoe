# 医疗 AI 仍然必须适配工作日常

<!-- EVIDENCE_GRADE_WARN: 本报告依赖分阶段整理的人因、工作流程、患者安全与治理来源。它不包含本地工作负荷测量、可用性测试结果、部署证据、结果数据或具名实施证明。 -->

医疗 AI 治理常常围绕模型文档、数据来源、政策控制和监测计划来展开。这些检查确实重要，但它们并没有回答一个决定工具能否在医疗服务中被负责任使用的实际问题：在真实条件下，由 AI 支持的工作流程是否适配真实的人类工作？

即使一个工具被描述为“仅用于辅助”，这个问题仍然成立。AI 摘要、分诊信号、文书建议或决策支持输出，都可能改变路由方式、审核队列、交接流程、沟通模式和责任归属。一个工作流程不会因为有了模型说明或接收记录就自动准备就绪。仍然必须有人去问：谁会看到这个输出，他们同时还在看什么，他们正在执行什么任务，承受着什么压力，以及他们是否有权质疑或覆盖这个结果。

## 即使是辅助型 AI，工作流适配也很重要

医疗工作流程本来就充满了相互竞争的任务、有限的注意力以及交接风险。在这种环境下，一个辅助型 AI 功能并不会只停留在模型层。它会改变周围的工作系统：文书处理时点、队列管理、升级路径，以及人工审核者必须介入的节点。

这也是为什么，人因审查最有价值的地方在于它是一个证据问题，而不是一句口号。严肃的审查会追问：涉及哪些用户、他们接触到什么界面、他们在什么环境中工作，以及当输出错误、不清晰、来得太晚或让人过度信任时会发生什么。当模型变化、界面变化、人员配置变化或本地流程规则变化时，这类审查也必须重新进行。

## 注意力负荷本身就是治理问题的一部分

医疗领域早已提供了一个关于警报疲劳的明确警示：一个在技术上看似合理的提示，如果出现在错误的时刻、出现得过于频繁，或与更紧急的需求相互竞争，仍然可能失败。这并不能证明 AI 系统在任何特定部署中已经造成了可测量的警报疲劳伤害。但它确实说明，AI 介导的提示应当被当作注意力预算的一部分来审查，而不只是一个内容质量问题。

AI 提示、摘要、分诊标记、文书建议和决策支持输出都在竞争注意力。一个考虑工作负荷的审查应当追问：该输出是打断式的还是被动呈现的，是强制处理的还是可忽略的，是时间敏感的还是容易延后的，以及它是否可能在高压下被误解。相关的本地证据可以包括覆盖或忽略模式、审核队列增长、重复劳动、升级率、投诉模式、交接摩擦以及用户反馈。

## 本地验证应衡量工作日负担

如果一个组织声称某个医疗 AI 工具减轻了负担，这一说法应当在本地接受验证，而不是被直接假定为真。本地验证不应只看输出质量，还应追问该工具如何改变工作的总量、时点、难度和责任归属。

有用的负担指标可以包括审核耗时、重复文书、审核队列规模、交接复杂度、升级摩擦、培训完成情况以及用户自报负担。如果一个工具新增了审核义务，治理机制还应决定谁来承担这项任务，以及为了腾出空间，哪些事情会被降级处理。缺少这一步，AI 工作流程可能只是转移了工作，而不是减少了工作。

<!-- EVIDENCE_GRADE_WARN: 人因审查、警报负担检查、培训计划和本地验证可以强化治理纪律，但这些分阶段来源本身并不能证明安全性、有效性、负担减轻或运营成熟度。 -->

## 人工审核必须是可操作的，而不是象征性的

“人类在环”只有在审核者拥有足够的上下文、时间、培训、权限和升级支持时才有意义。如果审核者看不到正确的背景信息、无法质疑输出，或无法在不造成延迟和混乱的情况下解决分歧，那么纸面上的人工审核要求就是脆弱的。

因此，培训属于工作流设计的一部分，而不是一种笼统的保证性说法。至少，培训应覆盖预期用途、已知限制、工作流程步骤、升级路径、文档要求以及变更通知。监督团队也需要现实可行的承载能力。如果在没有时间、人员编制或决策权限的情况下增加 AI 审核任务，监督就可能沦为纸面控制，而不是实际起作用的保障措施。

## 治理必须识别类别差异

这些分阶段来源支持把 FDA 关于医疗器械可用性的指导，当作一个严谨示例，说明为什么预期用户、预期用途、界面和使用环境都很重要。但这些来源并不支持把每一种医疗 AI 工具都当作受监管的医疗器械。受监管的 AI 医疗器械、认证健康 IT 预测型决策支持干预、环境式文书功能、面向患者的助手以及行政类模型，不应被视为同一种治理类别。

这种区分之所以重要，是因为不同类别对应的路由问题不同。器械场景、认证健康 IT 场景以及非器械工作流工具，需要不同的证据问题、不同的审查路径和不同的论断纪律。当类别不清楚时，更稳妥的做法是进行带有限定条件的审查，而不是随意泛化。

## 本草稿无法说明什么

- 没有本地工作负荷测量。
- 没有可用性测试结果。
- 没有部署证据或具名实施案例。
- 没有结果数据。
- 没有证据证明任何本地监督流程已经足够。

## 核心结论

医疗 AI 治理不应止步于“是否存在文档”。更困难也更有价值的检验，是这个工具是否能适配工作日常，而不会增加失控的注意力负荷、含糊不清的审核职责、重复文书工作，或无人负责的升级处理工作。在这个问题被本地证据回答之前，减负和运营成熟度都应被视为有待检验的主张，而不是可以直接假定的结论。

## 选定来源基础

- FDA, “Human Factors and Medical Devices”  
  https://www.fda.gov/medical-devices/device-advice-comprehensive-regulatory-assistance/human-factors-and-medical-devices
- FDA, “Human Factors Considerations”  
  https://www.fda.gov/medical-devices/human-factors-and-medical-devices/human-factors-considerations
- FDA, “Applying Human Factors and Usability Engineering to Medical Devices”  
  https://www.fda.gov/regulatory-information/search-fda-guidance-documents/applying-human-factors-and-usability-engineering-medical-devices
- AHRQ PSNet, “Alert Fatigue”  
  https://psnet.ahrq.gov/primer/alert-fatigue
- AMA, “Augmented Intelligence in Medicine”  
  https://www.ama-assn.org/practice-management/digital-health/augmented-intelligence-medicine
- NIST, “Artificial Intelligence Risk Management Framework (AI RMF 1.0)”  
  https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
- NIST, “AI Risk Management Framework Program”  
  https://www.nist.gov/itl/ai-risk-management-framework
- ONC, “Decision Support Interventions Test Method”  
  https://www.healthit.gov/test-method/decision-support-interventions
- The Joint Commission, “Initial Guidance to Support Responsible AI Adoption”  
  https://www.jointcommission.org/en-us/knowledge-library/news/2025-09-jc-and-chai-release-initial-guidance-to-support-responsible-ai-adoption
- WHO, “Ethics and Governance of Artificial Intelligence for Health”  
  https://www.who.int/publications/i/item/9789240029200
