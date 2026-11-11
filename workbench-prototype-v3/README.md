# 屹立工作台 · 总索引

当前文档入口，更新于 2026-11-11（北京时间）。本地工作台负责查看项目与资产状态、完成常规维护、把复杂任务交给智能体；不是所有业务都在本机运行。

## 从这里开始

| 目的 | 入口 |
| --- | --- |
| 员工实际使用 | [使用教程](docs/USER-GUIDE.md) |
| 新智能体接手 | [AGENT-START](docs/AGENT-START.md) |
| 遇到问题 | [FAQ](docs/FAQ.md) |
| 启动、数据与升级 | [运行说明](docs/OPERATIONS.md) |
| 修改后的验收与接续 | [验收清单](docs/CHECKLIST.md) |

在 PowerShell 执行 `& 'D:\Dev\smart-customer-service\workbench-prototype-v3\start-workbench.ps1'`，打开 <http://127.0.0.1:5185/#/grid>。该启动器使用 LOCALAPPDATA 下的 `YiliWorkbench/spatial-demo`；直接运行 `node server.js` 的默认端口和数据目录不同，不混用。

## 功能与维护地图

| 对象 | 当前用途 | 深入入口 |
| --- | --- | --- |
| 销售助手 | 部署交接、工作机、知识与物料、模型连接与基础维护 | [销售维护](docs/maintenance/SALES.md)、[源文件库](docs/SOURCE-LIBRARY.md)、[模型连接](docs/MODEL-CONNECTIONS-20261110.md) |
| 对接表 Agent | 账号与表配置、批次待补与卡片追问、运行排查 | [对接表维护](docs/maintenance/DOCK.md) |
| Prism | 图片与飞书教学笔记采集归档、本地教学资料预览、部署培训交接 | [Prism维护](docs/maintenance/PRISM.md)、[教学资料](docs/PRISM-TEACHING-MATERIALS-20261111.md) |
| 自动任务与底座 | 查询任务、服务与数据资产，按异常组装交接上下文 | [日报](docs/maintenance/REPORTS.md)、[GEO](docs/maintenance/GEO.md)、[画像](docs/maintenance/PORTRAITS.md)、[n8n](docs/maintenance/N8N.md) |
| 总览与记录 | 拖左侧看详情，拖右侧组装处理任务；记录操作结果 | [卡片与记录](docs/CARDS-AND-JOB-RECORDS.md)、[提醒规则](docs/OPERATIONS-REMINDERS.md) |

## 历史与实现记录

[原型阶段与历次实现记录](README-HISTORY.md)保留旧模拟流程及后续增量说明，用于追溯，不作为当前操作教程。当前功能以本页关联的使用教程、维护手册及实际代码为准。
