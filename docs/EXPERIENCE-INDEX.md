# 工作面与资产上下文卡片：完整经验索引

本目录与下方实验目录保留开发方法、设计演变、接手测试及复盘原文，不以摘要替代。历史观察只代表文中记录的时间和范围，不是当前运行状态或新的操作授权。

## 从真实代码提取工作面

1. [从实际代码提取实用工作面](CODE-TO-OPERATIONS-WORKFACES.md)：调查方法、能力划分、页面决策、复用步骤与验收。
2. [销售助手工作面复盘](WORKBENCH-SALES-OPERATIONS-RETROSPECTIVE-20261109.md)：常规操作直连、语义工作辅助、复杂任务交接，以及如何纠正页面堆积。
3. [迁移与智能体接手复盘](SALES-MIGRATION-RETROSPECTIVE-20261109.md)：用真实执行反推员工输入、工具职责和接续条件。
4. [Prism 工作面提取](PRISM-OPERATIONS-WORKFACES-20261107.md)与[对接表工作面提取](DOCK-OPERATIONS-WORKFACES-20261107.md)：方法在不同项目中的应用。

## 界面与交互的演变

- [界面先行的工作方式](WORKBENCH-UI-FIRST-20261106.md)
- [最初界面任务书](WORKBUDDY-WORKBENCH-UI-BRIEF-20261106.md)
- [V2 创意简报](WORKBUDDY-WORKBENCH-V2-CREATIVE-BRIEF.md)
- [V3 计划](WORKBUDDY-WORKBENCH-V3-PLAN.md)
- [V3.1 交互任务书](WORKBUDDY-WORKBENCH-V3.1-INTERACTION-BRIEF.md)
- [卡片详情看板优化方法](../workbench-prototype-v3/docs/CARD-DASHBOARD-OPTIMIZATION-20261111.md)

## 卡片上下文的独立接手测试

每轮保留原有 INPUT、RESULT、CONTEXT-FEEDBACK、README 和 REVIEW 文件；没有的文件不补造。输入、代理报告和主协作者评审应结合阅读，后续纠正不覆盖早期判断。

| 轮次 | 入口 |
| --- | --- |
| 首轮 | [实验设计与首轮目录](../workspace/experiments/card-handoff-terra-20261111/README.md) |
| 第 2 轮 | [设计](../workspace/experiments/card-handoff-terra-20261111/round2/README.md) · [评审](../workspace/experiments/card-handoff-terra-20261111/round2/REVIEW.md) |
| 第 3 轮 | [设计](../workspace/experiments/card-handoff-terra-20261111/round3/README.md) · [评审](../workspace/experiments/card-handoff-terra-20261111/round3/REVIEW.md) |
| 第 4 轮 | [设计](../workspace/experiments/card-handoff-terra-20261111/round4/README.md) · [评审](../workspace/experiments/card-handoff-terra-20261111/round4/REVIEW.md) |
| 第 5 轮 | [设计](../workspace/experiments/card-handoff-terra-20261111/round5/README.md) · [评审](../workspace/experiments/card-handoff-terra-20261111/round5/REVIEW.md) |
| 第 6 轮 | [设计](../workspace/experiments/card-handoff-terra-20261111/round6/README.md) · [评审](../workspace/experiments/card-handoff-terra-20261111/round6/REVIEW.md) |
| 第 7 轮 | [设计](../workspace/experiments/card-handoff-terra-20261111/round7/README.md) · [评审](../workspace/experiments/card-handoff-terra-20261111/round7/REVIEW.md) |
| 第 8 轮 | [设计](../workspace/experiments/card-handoff-terra-20261111/round8/README.md) · [评审](../workspace/experiments/card-handoff-terra-20261111/round8/REVIEW.md) |
| 第 9 轮 | [设计](../workspace/experiments/card-handoff-terra-20261111/round9/README.md) · [评审](../workspace/experiments/card-handoff-terra-20261111/round9/REVIEW.md) |
| 补充核查 | [运行路径安全核查](../workspace/experiments/card-handoff-terra-20261111/runtime-security/RESULT.md) |

当前维护规则和实现见[维护手册目录](../workbench-prototype-v3/docs/maintenance/)及工作台源码；历史测试不是可直接执行的最新任务书。

## 阶段总结与观察设计

- [完成度与功能体验报告](WORKBENCH-COMPLETION-AND-EXPERIENCE-REPORT-20261110.md)
- [卡片测试阶段进展](WORKBENCH-PROGRESS-3b226c81-93658021-20261111.md)
- [项目总结](WORKBENCH-PROJECT-SUMMARY-20261111.md)
- 仪表盘观察来源：[销售助手](WORKBENCH-SALES-DASHBOARD-SOURCES-20261107.md)、[Prism](WORKBENCH-PRISM-DASHBOARD-SOURCES-20261107.md)、[对接表](WORKBENCH-DOCK-DASHBOARD-SOURCES-20261107.md)
- [自动任务现场调查](WORKBENCH-LIVE-AUTOMATION-AUDIT-20261107.md)

## 完整性与范围

[原文清单](EXPERIENCE-ARCHIVE-MANIFEST.json)逐份记录 104 份原文的相对路径、SHA-256 和字节数：17 份方法与阶段文档，87 份卡片实验文档。它们与本次归档时的本地原件逐字节一致；本地原件未改动。清单和本索引是新增归档说明，不计入 104 份原文。

综合库 `smart-customer-service-QM` 中先前的摘录仍是历史导出版本；本次范围内需要完整上下文时，以这里的原文为准。文中的历史路径、端口、任务名称、运行计数及版本标识保留为工程证据；不包含这些路径所指向的客户资料、数据库、凭据、恢复包或知识库原件。外部项目源码和未纳入清单的其他文档不因被引用而自动包含在本库。
