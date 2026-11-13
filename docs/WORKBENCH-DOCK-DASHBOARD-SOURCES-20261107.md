# 对接表 Agent 仪表盘取材记录

2026-11-07，Asia/Shanghai。仅查代码和文档；未连接飞书、生产观测 API、私有账本或凭据。

目标：品宣市场对接表 mkt_dock，table ID tblXjEzSyu3LMiPN。不能把入学表及独立私域同步支线混入统计。

源码基于 project/modules/auto-fill-table-bot/src/aftb：

- bot/longconn.py：processing_status、send_status、decision_source、wrote、trace。api_accepted 只代表消息接口接受，不是写入或阅读证据。
- pilot_obs/api.py、ledger.py：已有可观测元数据，不等于已与工作台接通。
- operation_receipt.py：结构化操作回执与批次 completed/partial/pending/unknown；batch_new_writes 与 batch_recovered 分列。failed_or_unknown 不得都归为可直接重试。
- excel_import.py、excel_card_actions.py：预览、确认、批次处理。
- employee_tables.py：创建意图与绑定持久化、schema_pending、未知建表结果不重复创建。
- employee_mirror.py、employee_authority.py：双表与字段授权，需逐侧判断，不以单侧成功代替双表完成。

历史状态依据 docs/MKT-DOCK-OBJECT-RECEIPT-REMEDIATION-20261031.md 的 2026-11-05 更新：本地与真实模型选表验证已有，隔离飞书验收与发布仍待完成。此为历史记录，不是当前生产查询。

仪表盘四区：消息、实际写入、Excel 批次、双表及权限。实时数字保持未知；未来通过只读脱敏适配器按 trace/批次/回执关联。业务完成与回复文案分开，消息发送成功不能洗成写入成功。当前只完成信息结构，未接监控。
