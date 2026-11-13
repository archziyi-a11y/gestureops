# 销售助手单卡接手结果

## 范围与结论

2026-11-11 17:30 左右，Asia/Shanghai（本机系统时钟；未校准），针对本机用户访问的 `http://127.0.0.1:5185`，只读核查销售助手卡片及维护链。当前业务可用性**未验证，不能判正常或故障**；也未发现足以确认业务故障或严重事件的证据。根因无从确定，未修复、未部署、未验收。

## 实际证据

- 读取根目录 `AGENTS.md`、本轮 `INPUT.md`、`docs/WORKBENCH-SALES-DASHBOARD-SOURCES-20261107.md`，未读取其他轮次或代理报告。源码工作树 HEAD 为 `3b226c81ae597b5714224748791c3a9cfc17391b`，不证明运行实例加载了此版本，且不代表工作树无修改。
- 本机监听 `127.0.0.1:5185`，PID 54000，进程 `node.exe`，命令行为相对路径 `server.js`。未确认其工作目录、STATE_DIR、实际加载版本或定时器开关，不能仅凭同名文件断定运行身份。
- 审查 `workbench-prototype-v3/server.js` 和 `src/domain/balance-monitor.js`：本地 GET `/api/balance-monitor` 返回内存快照，代码路径不主动发起余额查询。实际 GET 只投影销售连接状态：`ok`，有 CNY 项，无错误，间隔 60 分钟；最后成功 `2026-11-11T08:35:07.920361+00:00`，最后尝试 `2026-11-11T08:35:09.357Z`。按主机时钟 17:30:44 +08:00 算，距最后尝试约 55 分钟；这是缓存记录时间到本次读取时间，非实时服务商查询。未输出金额或凭据。
- 本地源码 `src/ui/overview-observations.js` 从 `/api/operations-reminders` 组合余额、销售问题及设备观测，问题优先于余额；`balance-summary.js` 区分无值、错误、旧值和偏低。没有请求该聚合接口，未审完其全部副作用；因此未核实浏览器当前卡面或提醒、设备状态。`node tests/balance-summary.mjs` 离线通过，覆盖摘要的余额、偏低、旧值、缺金额；不代表当前实例或业务链通过。
- 源码 `src/ui/sales-operations.js` 显示项目入口及四个工作面：部署迁移、工作机、知识与物料、运行与排查；具体路径分别为 `#/p/sales/migrate`、`#/p/sales/w/devices`、`#/p/sales/w/knowledge`、`#/p/sales/w/runtime`。这是代码入口，未进行浏览器实际操作。`project/modules/qm-sales-assistant/README.md` 指向独立 Android 工程 `D:/Dev/AndroidProjects/SASALELE`，本仓库业务后端为 `project/modules/marketing-chat-insight/src/mktci`；这些是源码位置，不是当前部署位置的证明。

## 维护接续

1. 先核实当前实例的工作目录、启动脚本、数据目录和加载版本，关联对应快照；相对命令行不足以确定这些字段。审查聚合 GET 及其下游完整副作用后，若仍符合授权，再只读核对当前卡面对应的提醒和工作机观测。
2. 按问题分别走工作机授权、生成、画像、物料与知识链路；源码入口分别见来源索引所列 `sales_devices.py`、`sales_generation.py`、`sales_experiment.py`、`sales_http.py`、`sales_materials.py`。实际部署位置、版本、设备账号、当前回执及依赖均待核实。不能用进程、health、缓存余额、复制行为或历史摘要替代顾问获得有效结果。
3. 运维资料：`workbench-prototype-v3/docs/MODEL-CONNECTIONS-20261110.md`（模型配置和余额）、`project/modules/qm-sales-assistant/deploy/README.md`、`project/modules/qm-sales-assistant/docs/SERVER-MIGRATION-DEPLOYMENT-SOP.md`（部署迁移）；`docs/WORKBENCH-SALES-DASHBOARD-SOURCES-20261107.md` 是取材索引，不是完整业务排障手册。建议补一份覆盖四工作面、实例身份、各故障分支与端到端验收的统一销售维护索引；本轮未修改共享手册，未逐项核对线上部署变化。
4. 必须另获明确授权后才可访问远端、调用模型、使用真实账号或执行写入、重试、启停与部署。真实业务验收须指定设备、账号、会话、测试数据及可观测回执，分别验证身份、业务结果与顾问实际获得结果；现阶段不安排补跑。历史结果仅为对应时间的证据。
