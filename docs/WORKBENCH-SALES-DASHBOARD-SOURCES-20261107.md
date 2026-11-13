# 销售助手仪表盘取材记录

2026-11-07（Asia/Shanghai）。只查源码和项目文档，未访问生产、未读取私有数据库或凭据。

当前正式 Android 工程为 D:/Dev/AndroidProjects/SASALELE，本仓库 qm-sales-assistant 的探针 README 后半部是历史资料。业务后端位于 project/modules/marketing-chat-insight/src/mktci。

| 显示区域 | 源码证据 | 不可推出的结论 |
|---|---|---|
| 服务观测 | sales_http.py /_health/live、/sales/health | alive 或 model_configured 不代表模型成功；generation_available 是固定返回值 |
| 员工设备 | sales_devices.py inventory：expires、revoked、last_seen | 最近鉴权不是实时在线；没有客户端版本字段，不编版本覆盖率 |
| 回复、润色、销售指导 | sales_generation.py tasks；sales_experiment.py attempts/events | 复制不等于发送、采纳或销售效果 |
| 画像与跟进 | sales_http.py accounts/detail/followups；portraits | 无聊天不等于模型故障，跟进列表不等于已推送 |
| 团队资料与知识 | sales_materials.py materials/material_events；sales_experiment.py effective | copy/share 为行为记录，实验分组不等于实际知识注入 |

历史摘要来自 project/modules/qm-sales-assistant/docs/PROJECT-STATUS-AND-RETROSPECTIVE-20261104.md，只作为有日期的项目记录。当前工作台没有生产聚合读取适配器；本次改版展示真实能力分类、历史摘要和未知观测，不生成伪实时指标。

后续采集需独立只读适配器：先接健康和设备授权，再接按功能的生成聚合与内容资产。不可让浏览器读取原始数据库或携带生产 Key。统计显示窗口起止、采集时刻、时区、来源；空记录与采集失败分开。当前无统计窗口实测数据。
