# 销售助手维护入口

适用：工作台销售助手卡片与四个工作面。2026-11-11 按工作区代码核对；源码入口不等于已部署版本。

## 从实际问题进入

| 用户现象或目标 | 工作面 | 首查依据 |
| --- | --- | --- |
| 部署、升级、迁移 | `#/p/sales/migrate` | 部署 SOP、真实恢复交接、`src/domain/recovery-package.js`；区分材料核对与实际恢复 |
| 手机无法使用、版本旧、更新失败 | `#/p/sales/w/devices` | 方舟清单、设备状态、安装回执；安装回报不替代手机当前版本 |
| 资料不可见、回答未用新知识、提示词版本不符 | `#/p/sales/w/knowledge` | 原件、整理关联、知识版本、业务提示词当前生效版本、团队物料查询分别核对 |
| 模型连接、余额、生成或画像异常 | `#/p/sales/w/runtime` | 对应功能运行汇总、连接配置、错误回执和余额快照；不额外生成客户内容来凑验证 |

工作面装配见 `src/ui/sales-operations.js`。业务后端在 `project/modules/marketing-chat-insight/src/mktci/`，手机端另在 `D:/Dev/AndroidProjects/SASALELE`。

## 卡片为什么这样显示

`src/ui/overview-observations.js` 汇总提醒、设备与余额；提醒优先。沿 `server.js` 的 `/api/operations-reminders` 到 `src/domain/sales-overview-refresh.js` 检查：刷新会读取工作机，按已有问题查询物料或模型连接，并按余额检查周期调用供应商。提醒同步也可能保存状态。

因此，这个 GET **不是纯快照**。本轮仅允许本地缓存检查时，不调用它冒充无外呼探针。`GET /api/balance-monitor` 读取已有快照，可在核对当前 handler 后使用；销售余额成功只覆盖余额，不代表回复、画像或设备正常。

余额按 `checkedAt` 最后成功、`lastAttemptAt` 最后尝试和 `intervalMinutes` 判断；无成功值就写尚无成功结果，不写保留上次余额。实例身份只查必要的 PID、入口、cwd、端口和数据目录，不转储环境变量。

## 业务证据分层

- 帮我回、润色、销售指导分别核对最近成功、进行中、失败；近期无请求不是故障。
- 画像生成与同步分开；旧画像存在不证明本次生成成功。
- 设备在线不证明销售 API 可用；API 接受不证明生成完成。
- 物料为零可能是已删除或尚未上传，先查操作背景，不自动判数据丢失。
- 余额端点不支持不等于模型不可用；不靠重复查询或模型调用消除未知。

后端定位可从 `sales_http.py` 路由到 `sales_devices.py`、`sales_generation.py`、`sales_materials.py`、`sales_experiment.py`。工作台展示依据另见 `docs/WORKBENCH-SALES-DASHBOARD-SOURCES-20261107.md`，这是来源索引，不是实时运行回执。

## 交付与接续

### 直接接续索引

- 部署 SOP：`project/modules/qm-sales-assistant/docs/SERVER-MIGRATION-DEPLOYMENT-SOP.md`。
- 迁移接手：仓库根 `docs/SALES-ISOLATED-MIGRATION-AGENT-HANDOFF.md`，不是工作台 docs 下的同名文件。
- 2026-11-09 本机隔离恢复与独立接续：`workspace/experiments/sales-isolated-migration-handoff/ROUND7-TOOL-FIX-RESUME-LOCAL-TLS-20261109.md`，不代表当前生产或异机验收。
- 功能历史证据：`project/modules/qm-sales-assistant/docs/PROJECT-STATUS-AND-RETROSPECTIVE-20261104.md`，按记录日期解释。
- 画像同步：本目录 `PORTRAITS.md`。只读投影任务账号、输出目标和产物元数据后再关联；默认 CSV 存在不证明是当前任务目标。注册脚本会执行同步，不当作查询入口。

`GET /api/sales-runtime` 经 `scripts/model_connections.py` 请求远端 `/sales/admin/runtime-summary`，不是本机缓存。纯本机诊断不包含该请求。当前源码可帮助审查，但不单独证明运行进程加载了同一版本；无法取得 cwd/运行版本时按实际实例报告快照，并保留这个限定，不因此丢弃已取得的观测。

完成本轮允许的本地检查；区分确实受限与尚未调查。维护手册引用的 SOP、历史交接和验收可以读取，包括其他智能体编写的正常项目记录，但须保留时间、版本和验证范围。恢复包存在、离线测试通过均不冒充生产恢复成功。

记录当前现象、证据、已做操作、未覆盖路径与下一步。修改凭据、重载、下发更新、发布提示词、恢复或重试业务按具体授权执行。复杂故障不自动等于严重故障；错对象写入、泄密与覆盖数据应独立处理。
