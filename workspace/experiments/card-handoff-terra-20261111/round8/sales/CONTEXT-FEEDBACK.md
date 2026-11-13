# 上下文反馈

2026-11-11，Asia/Shanghai。本次仅根据本卡及正常维护材料诊断，INPUT 的注册内容不是实时采集。

- 维护入口有效地提示了提醒 GET 的外呼和持久化风险；建议保留明确的禁用说明，并给余额 GET 加上“先核对运行实例版本；当前源码审查不等于运行代码证明”的限定。
- 手册只写“部署 SOP、真实恢复交接”，缺少明确路径。建议在 `SALES.md` 列出 `project/modules/qm-sales-assistant/docs/SERVER-MIGRATION-DEPLOYMENT-SOP.md` 和 `workspace/experiments/sales-isolated-migration-handoff/ROUND7-TOOL-FIX-RESUME-LOCAL-TLS-20261109.md`，注明日期、隔离范围及不代表现状；同时链接 2026-11-04 项目复盘以便逐功能寻找历史证据。
- 画像同步是独立链路，建议销售卡上下文明确链接 `workbench-prototype-v3/docs/maintenance/PORTRAITS.md`，提示只读任务账号、目标路径和产物元数据，并指出注册脚本会真实同步。
- 明确 `GET /api/sales-runtime` 虽为 GET 仍经本机 Python 访问远端管理接口，纯本机授权不包含此请求。分别列出本机可行检查、远端受限检查和未调查项，避免把静态注册的“余额待查询”当实时故障。
- 实例核查建议给出不暴露整份环境的字段级路径：监听 PID、绝对入口、cwd、数据目录及版本；无法获得时说明证据影响，仍可按实际监听实例报告缓存而不冒称源码已部署。

以上为修订建议，未修改共享手册或生成器；无证据支持改动业务范围、权限或严重度。
