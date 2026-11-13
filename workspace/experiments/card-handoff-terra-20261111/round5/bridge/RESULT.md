# 对接表单卡维护交接

## 范围与时间

本机只读调查，2026-11-11 16:52 左右，Asia/Shanghai (UTC+8)，时间来自 Windows 主机时钟，未校准外部时钟。卡片的最近观测 08:35:17.500Z 即 16:35:17.500 本地时间，卡片组装观测 08:48:31.665Z 即 16:48:31.665；这不是实时成功或真实入库时间。未读取其他卡或历史轮次报告。

## 证据和结论

- 工作台 127.0.0.1:5185 本机监听 PID 54000，进程为 node.exe server.js，创建于本机 14:11:15；`/api/health` 返回 ok。它只证明本地端点响应，未证明当前源码版本、状态目录或业务可用。
- Windows 服务 AFTB-Bot 为 Running、Automatic；服务注册参数中的工作目录和 bot 脚本入口与本仓库匹配。进程运行不证明飞书连接、模型调用或写表成功；实际部署版本和配置生效值未核实。
- 默认路径 `workbench-prototype-v3/data/balance-monitor.json` 的 dock 元数据：最近尝试 08:35:17Z、错误 `balance_endpoint_unavailable`，无余额、无成功查询时间；文件本地修改时间 16:35:17.500+08:00。无法确认 5185 使用该默认目录或内存状态仍与文件一致，因此这是本地保存证据，不是当前实时查询。没有余额不能推断为零或余额不足。
- `src/domain/balance-monitor.js` 失败保留旧结果并记录错误，默认 60 分钟；`scripts/dock-runtime.py` 包含供应商余额查询，`server.js` 的 balance 操作会触发查询。未调用。`docs/maintenance/DOCK.md` 记录的接口不可用是历史证据，不足以证明现在供应商仍不可用；本次未确认根因。
- `src/domain/business-card-observations.js` 的卡片来源索引指向生产操作回执聚合，不是余额错误的直接来源。`scripts/read-business-observations.py` 会解析账本整行，无法保证不读取客户正文，因此未运行，也未读取账本、逐项回执或批次。无指定批次，不能判断部分完成、未知结果、错表或重复写入；未发现可证实的严重事项，但不等于不存在。

## 维护与接续

本轮未修改代码、配置、共享手册、服务或部署，未执行远端请求、模型、消息、重试或测试。未验证当前实例的工作目录、STATE_DIR、实时余额、业务链路或生产验收；未证明恢复。没有新的代码部署证据。手册入口、诊断原则与本地实现已作静态对照；由于运行版本未确认，是否需更新手册待核实，不声称无需更新。

接手者先确认 5185 进程实际工作目录、状态目录和运行版本，并只读核对该实例的余额快照、最后成功与尝试时间；不暴露密钥或客户正文。余额失败持续时，必须先取得负责人对供应商只读查询的明确授权，再在工作台“运行与排查”查询指定主模型连接，记录状态、错误码及主机时钟，不调用生成；亦可由获授权人员查看供应商控制台。核对成功后才能确认余额状态，不能以模型目录成功推断余额接口成功。涉及重启、变更、重试、飞书或生产操作另行授权。若出现重复写入、错表、越权或泄密，独立严重上报并停止扩大操作。无临时绕过。

相关入口：本卡 INPUT.md；`workbench-prototype-v3/docs/maintenance/DOCK.md`；`workbench-prototype-v3/server.js`；`workbench-prototype-v3/src/domain/balance-monitor.js`；`workbench-prototype-v3/scripts/dock-runtime.py`；`scripts/read-business-observations.py`。
