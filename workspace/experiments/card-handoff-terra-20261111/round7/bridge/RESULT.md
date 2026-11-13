# 单卡接手检查结果

## 范围与时间

本机工作台 `http://127.0.0.1:5185`，仅诊断对接表 Agent 卡片；未指定批次。主机时钟 Asia/Shanghai (UTC+08:00)，2026-11-11 17:30:28 取得余额快照；不代表供应商实时查询时间。未访问历史轮次或其他代理报告。

## 当前证据

- TCP 127.0.0.1:5185 的监听 PID 54000，node.exe，命令行 `node.exe server.js`，创建于本机 2026-11-11 14:11:15。相对路径无法单凭命令行确定 cwd 或脚本绝对路径；父 PID 12624 查询无结果，查询 Windows 服务未发现该 PID，启动登记搜索未找到对应项。STATE_DIR 和 BALANCE_MONITOR_DISABLED 未确认。源码时间早于进程创建，但不能证明进程加载的文件与当前源码完全一致。
- 当前工作区 `workbench-prototype-v3/server.js` 的 GET `/api/balance-monitor` 返回内存 snapshot，不主动请求供应商；POST 可修改设置，不可用作只读。经此源码审查后对当前监听端口 GET，取得 dock: `lastAttemptAt=2026-11-11T08:35:17.500Z`（北京时间 16:35:17.500），`checkedAt=null`，`error=余额更新失败，等待下次检查`，`errorCode=balance_endpoint_unavailable`，`balances=null`。尚无成功余额结果，不能说保留了上次余额。错误分类本身不能证明根因、供应商当前状态或模型生成不可用。
- 快照 intervalMinutes=60；从主机记录的最后尝试到本次观测约 55 分 11 秒，尚未超过此间隔。源码按 lastAttemptAt 调度；是否启用定时器和实际后续执行未验证。源码启动时默认启动，除非 BALANCE_MONITOR_DISABLED=1；不能把默认值当作实例配置。
- 入口源码 `src/ui/dock-runtime.js`：对接表 → 运行与排查 → 主模型账户余额；普通读取走快照，主动“查询余额”走 POST 并触发供应商查询，本轮未点击。`src/domain/operations-reminders.js` 的错误文案无条件写“保留上次结果”，与无成功值的快照不符；这是源码层面可复现的文案缺陷，并非已经修复。
- 来源分离：`src/domain/business-card-observations.js` 将业务卡片来源标为 operation_receipt，历史计数不代表今日成功率；余额错误来自 balance-monitor 和 reminders，不应以操作账本作为余额错误证据。`scripts/read-business-observations.py` 虽只输出计数，但内部逐行解析完整账本；无指定批次，本轮未执行，也未读取账本正文。业务写表可用性、个人表与总表结果均未验证。
- `node tests/balance-monitor.mjs` 通过，使用模拟 query 与独立系统临时目录，覆盖阈值、失败保留、调度、并发等；这是离线测试，不证明真实供应商或业务可用。未对真实私有库执行 HTTP 下载、远端请求、模型、消息、业务写入、启停、补跑或配置变更。

## 维护接续

根因未知；没有证据证明恢复，也没有证据证明当前写表失败或严重事项。此轮授权不含主动查询、重启、改配置或远端验证；必要时由负责人另行授权，明确目标账号与操作范围后检查供应商余额端点及配置来源，区分不支持、配置和网络等原因。若后续出现指定批次，先只读核对操作键及逐项回执、个人表和总表；成功行不重试，未知先查 operation_status。任何重复写入、错表、越权或泄密证据须独立上报，当前未发现相关证据并不代表已全面排除。

已核对 `workbench-prototype-v3/docs/maintenance/DOCK.md` 与 `docs/MODEL-CONNECTIONS-20261110.md`：入口、分支和离线验收依据存在；建议补充无成功余额时的文案、来源分离以及实例 cwd/配置未确定的验证限制。仅报告目录获写授权，未修改共享手册。未实际访问配置描述接口、逐批回执、浏览器交互或端到端业务；进程字段级 cwd 和两个环境字段仍可在找到可靠只读工具或启动登记后核查，不应因受限而假定其值。真实隔离操作及生产业务验收均未覆盖。
