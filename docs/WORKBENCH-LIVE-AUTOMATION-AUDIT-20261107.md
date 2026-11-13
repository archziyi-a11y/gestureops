# 本机自动任务与基础设施只读盘点

观测起点：2026-11-07 10:30:12 +08:00，Windows 主机时钟。执行记录数据库时间按 UTC 转北京时间。范围：本机计划任务、服务、端口、Docker 容器、n8n SQLite 只读元数据、文件属性。未启动/停止任务，未读凭据、聊天正文、画像 CSV 内容；未查询远端业务表。

## 发现

| 对象 | 实测 | 不能据此推出 |
|---|---|---|
| jyq-room-fetch-daily | Ready；最近 11/6 21:00:01，结果 1；日志 21:00:03 开始、exit=1；下一次 11/7 21:00 | 未判定错误原因；不能把失败直接等同于零产物 |
| 教研归档 manifest | 最后修改 11/4 21:00:16，833556 字节 | 修改时间不证明消息覆盖范围或 Prism 入库 |
| SASALELE-Portrait-Sync | Ready；11/7 09:50:16 结果 0；下一次 10:50:14 | 不是飞书画像生成任务 |
| 本机画像 CSV | LocalAppData/SASALELE/画像/最新画像.csv，11/7 09:50:21，8300 字节 | 未读正文，未核对行数、新鲜度或消费 |
| SCS-DD-MOD-004-Services | 登录任务；11/3 14:02:43 结果 0 | 负责启动基础服务，不代表业务定时成功 |
| AFTB-Bot / AFTB-Pilot-Observation / PXKB-Bot | Windows 服务 Running、Auto | 不证明飞书连接或当前业务成功 |
| n8n / Caddy | pxkb-n8n 与 scs-n8n-caddy 容器 Up 2 days | 不证明工作流成功 |
| Job 端口 | 本机 8765/8766/8767/8768 监听；启动脚本对应 PXKB/PDDR/MKTCI/GEO | 未探测健康接口或产物 |
| OpenClaw GEO | 18789 监听 | 不证明内容生成或发布成功 |
| Prefect | 本次常用端口检查未见 4200；源码存在 | 不能据此断言所有 Prefect 实例停用 |

画像任务脚本 sync_portraits_local.py 明确通过 SSH 只读拉取远端 SASALELE SQLite 画像到本机；无远端写入、无模型调用。它与旧 MKTCI → 飞书画像链不能混算。

## n8n 数据库核验

在 pxkb-n8n 容器使用 node:sqlite readOnly 查询 workflow_entity / execution_entity；未导出工作流节点、凭据或业务 payload。

查询窗口：2026-10-31 02:30 UTC（北京时间10:30）起，至本次读取时数据库现有记录。8条流程共45条执行记录全部 error：

- PDDR evening 6；morning 5。
- PXKB deadline-alert 5；morning-brief 5；merge 6；push-dashboard 6；report-prompt 6；report-remind 6。

查询当前数据库全部 retained success 记录未返回行；不解释为历史上从未成功。

最近两次脱敏顶层错误：
- pxkb-schedule-merge：NodeOperationError / failed（原因不足）。
- pddr-schedule-morning：NodeApiError / connection aborted, perhaps server offline（不足以断言服务器离线）。

11 个 workflow active=1；包含旧 evening-chain、morning-deadline 和名称为 manual 的工作流。active 不等于具备有效定时触发，也不据此宣称重复调度。

停用：mktci daily-insight / churn-insight、pxkb week-cutover、GEO health / inventory-refresh / sync-published-urls。本数据库未见独立 profile-enrich 工作流；不能排除其他调度源。

原始 KPI 快照目录最新统计日为 2026-11-06（11/7早间有目录变化），说明有本地取数产物迹象，但飞书写表与摘要推送未确认。采集、加工、入库、通知必须分列。

## 下一步

1. 先诊断 PXKB/PDDR 任务链错误和 JYQ exit=1，查脱敏阶段回执，不自动重跑写表/发消息。
2. 清点 n8n 各 enabled 流程触发类型、是否替代/重复；对 MKTCI 停用先查决策，不自行启用。
3. 单独追踪旧方舟→飞书画像链；本机 SASALELE CSV 同步不能替代其状态。
4. 面板至少区分服务存活、调度启用、最近批次、最后成功、产物更新、消费证据。保存本次观测时间，不显示为永久实时状态。
