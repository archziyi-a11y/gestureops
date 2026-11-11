# 日报与汇总提醒维护

## 本轮目标与验收

2026-11-11：修正卡片分类、补错误定位与接手入口。不得发送提醒、写飞书、补跑历史任务或用健康检查代替恢复验收。离线测试覆盖日志无敏感正文、run_id 一致、分类与 webhook 展示、上下文手册引用；现场只读观察单列。

## 实际入口

- PXKB：`project/modules/brand-pr-workboard/scripts/run_pxkb.py serve-jobs`，HTTP 8765，`pxkb.job_http.dispatch_job`。
- PDDR：`project/modules/private-domain-daily-report/scripts/run_daily.py serve-jobs`，HTTP 8766。
- 调度：Docker `pxkb-n8n`；容器内 `/home/node/.n8n/database.sqlite`，SQLite OPEN_READONLY。
- 工作流 `workflow_entity`、执行 `execution_entity`、详情 `execution_data`；后者 data 是 flatted，不是普通 JSON。读取 HTTP 节点 `resultData.runData.*[].data.main[0][0].json.machine_fields.error`，不要只读 StopAndError 的 failed。
- 安全读源实现：`workbench-prototype-v3/src/domain/report-card-observations.js`。仅返回分类、时间和统计，不导出客户正文/凭据。
- 配置 `config/.env`，成员 `config/pxkb_roster.json`；表拓扑 `project/modules/brand-pr-workboard/docs/DATA_TABLES.md`；调度与时区 `project/docs/N8N-MIGRATION.md`。

## 2026-11-11 只读核实

本机时钟 10:44:55 北京时间（02:44:55 UTC），查询 startedAt 在 UTC [2026-11-04T02:44:55.954Z, 2026-11-11T02:44:55.954Z) 的保留记录：56 次，0 success，56 error/canceled；不代表完整历史从未成功。8 条启用链最近失败，3 条 webhook 无执行不算故障。容器时钟偏差未独立校准。

PXKB 进程从 11-03 14:02:53 +08:00 启动。当前工作区客户端已含 HTTP/JSON 错误分类，但运行进程是否加载同一代码未证实。本轮读取 load_settings：Base 未配置、dashboard 未配置、主管 chat 已配置、roster 7 人；未输出凭据与人员标识。

## 分支与验收

| 现象/原始报文线索 | 定位与处理 | 验收 |
|---|---|---|
| Bitable list failed / month's API call quota exceeded | Bitable 取数额度，不是消息额度。查租户/应用实际配额规则，禁止猜重置日期或换应用绕过 | 同一取数请求成功，再核对业务回执 |
| Bot has NO availability to this user | report_prompt 遍历 roster 员工 open_id；核对当前员工标识与应用可用范围。主管推送才用 supervisor_chat_id，不能互换 | 指定收件人可用，另授权一次发送并确认回执 |
| PXKB_DASHBOARD_URL 未设置 | DATA_TABLES.md 已有“品宣部任务看板·本周”链接，env.example 同源。历史地址须核对仍有效后再写配置，不让用户重新搜历史 | 配置被当前进程读取，链接目标正确；单独验证推送 |
| Extra data / JSON 错误 | 不能当作上游数据损坏的结论。查 job_failed 的 run_id、exception、frames（文件/函数/行号）；不记录 locals、源码行、响应正文。当前 Base 为空是明确配置缺口，不足以证明所有历史解析错误同根 | 原失败解析位置可定位；同输入回归通过；新任务回执验证另列 |

## 处理边界

普通：已确认配置缺失、配额或收件范围。复杂：解析点未知、运行版本与工作区不一致，独立诊断。严重：错人外发、越权/重复写表、泄密，单任务处理，不批量重试。

`dry_run` 必须逐链检查：消息跳过不保证无 API 读取、本地状态写入或其他副作用。首次排查优先离线保存样本与替身；禁止为拿栈触发真实 merge。服务重启加载代码不证明业务恢复；保留老失败记录，成功须来自新回执。

## 交接维护

每次修复记录根因依据、修改、验证、未完成项与实际加载版本；手册立即更新，不只放会话记忆。旧调查保留日期。卡片由重新观测更新，不手工涂绿。
