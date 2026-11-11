# Prism 资料链维护入口

适用：2026-11-10 工作区；生产和隔离环境分别记录。

（2026-11-11 核对：链路入口与依赖未变；新增下表两行核对项与"退出码与回执"节，未改动原有条目。）
（2026-11-11 修订：采集状态改三分 success/partial/failed，退出码 0/2/1；新增 `_meta/last_result.json` 与 `_meta/collection_pending.json` 两个入口。旧的 0/1 口径已不适用。）
（2026-11-11 补充：回执增加 `scope`/`rooms` 与 `window`/`resume_reason`，待补拆 `pending_in_scope`/`pending_out_of_scope`，资产拆 `assets_new`/`assets_filled`/`assets_skipped`/`assets_unfinished`。单群运行不得代表四群结果。）

## 链路与入口

微信归档来自 SCS 的 `project/modules/jiaoyan-qun-archive`；Prism 位于 `D:/Dev/Prism`，主要入口为 `services/ingestion`、`services/read_api`、`services/feishu_sync_job`。先读该仓库协作规则和 `workspace/agent_bridge/CURRENT.md`。

## 按现象定位

| 现象 | 核对 | 完成依据 |
| --- | --- | --- |
| 今天没有采到 | 白名单、调度回执、来源时间、清单变化 | 对应范围确有新产物；无新消息不判故障 |
| 有清单但缺图片 | 清单路径、原图/缩略图、存在性、大小与摘要 | 逐项媒体可读取；不能只比较条数 |
| 归档有，Prism 没有 | teaching_asset 合同、事件结果、来源标识、数据库环境 | 正确资源入库且可检索，不用正式笔记冒充 |
| 教师找不到/打不开 | 资源与媒体映射、科目、身份会话、ACL、读取端 | 指定身份找到并打开，未授权身份仍拒绝 |
| 重复或半批成功 | 来源标识、内容指纹、每项结果 | 已成功不重复写；只处理确定未完成项 |
| 退出码非零但目录里有东西 | 当日 `_meta/runs/YYYY-MM-DD.log` 的 status/error/paths；manifest 的 `fetched_at` 日期 | 分清"本次零产物"与"他次补跑产物"；目录存在不是本次成功的依据 |
| 半批笔记 | 该 `msg_id` 的 `wechat_note`/`wechat_note_xml`/`wechat_note_image` 三类清单行与磁盘文件 | 缺项补齐；不能因 `msg_id` 已在清单就跳过 |
| 单群补采后卡面显示"正常" | `last_result.json` 的 `scope`、`rooms`、`pending_out_of_scope`；调度器 `LastTaskResult` | 单群回执不等同四群结果；其他群欠账与调度器非零仍要显示 |
| 报告说只采某日、却回看了更早 | `requested_since` 与 `since_ms`/`window` 对照；`window_from_pending` 与 `resume_reason` | 按实际窗口描述；前推需说明依据，不能既说只采某日又读了更早 |

默认不扩大采集群范围，不开启公网，不公开私有附件。资料用途或归属不明确时先澄清，不用全员可见规避权限问题。生产入库和权限变更须明确目标及范围。

批次检查只证明所检查文件；隔离验证只证明合同与流程。教师验收需独立保留身份、资源、时间和结果，不能以模拟会话替代。

维护后更新已确认改变的入口、依赖和验收方式，保留历史证据。未知原因写清接续点，不把手工报告直接当卡片健康状态。

## 退出码与回执（2026-11-11 修订：三分状态）

- **状态**：`success` / `partial` / `failed`；退出码 `0` / `2` / `1`。`partial` 仍是非零——扫描完成但有未完成项不等于健康。
- **判定**：`failed` = 零产出且存在未完成项；`partial` = 有产出但仍有未完成项，或扫描范围未完成；`success` = 扫描完成且无未完成项（本期确实没有新消息也算成功）。
- **读卡顺序**：
  1. `_meta/last_result.json` — `status`、`scope`、`rooms`、`exit_code`、`counts`、`scan_complete`、`scan_incomplete_rooms`、`failed_by_stage`、`pending_in_scope`/`pending_out_of_scope`、`window`、`window_from_pending`、`resume_reason`
  2. `_meta/collection_pending.json` — 未完成项（`stage`/`attempts`/`msg_id`/`path`）与未完成扫描窗口（`room_id`/`since_ms`/`until_ms`）
  3. `_meta/runs/YYYY-MM-DD.log` — 原始 stdout 与 `----- exit=N status=... -----`
  4. 调度器 `LastTaskResult` 只作触发证据，不作完成依据
- **范围（2026-11-11 新增）**：`scope=room` 表示单群运行，只代表 `rooms` 里列出的群；`scope=all-whitelist` 才是四群日跑。单群回执不得把四群卡片判为正常：卡面会显示"单群采集完成（群名）· 仅覆盖 1/4 群"，并保留调度器口径的待核对标记。`pending_in_scope` 是本次范围欠账，`pending_out_of_scope` 是其他群欠账；全局待补非空不等于本次范围失败。
- **窗口与前推（2026-11-11 新增）**：`requested_since` 是命令里写的日期，`since_ms`/`until_ms`/`window` 才是实际读取范围（北京时间）。前推只依据**本次范围内**的待补项；`window_from_pending=true` 时 `resume_reason` 给出最早待补时间、涉及群与原因。描述一轮采集时必须按 `window` 说，不能只按 `--since` 说。
- **资产口径（2026-11-11 新增）**：`assets_new`（此消息此前无已完成资产）+ `assets_filled`（补齐半批）应等于 `manifest_appended`；`assets_skipped` 是因已完成而跳过，`assets_unfinished` 是登记台账的未完成项。**消息数与文件数不混算**；一轮跑完零新增是正常结果，不要求凑数。
- **失败分三类，不可互相替代**：`network`（下载、分页、成员查询）、`write`（目录、文件、清单）、`parse`（消息或 XML 结构）。`images_skipped` 只统计按设计跳过的 `cdndataurl`，不再吸收下载失败。
- **恢复方式**：单项失败不阻塞整轮；下次运行按 `collection_pending.json` 把窗口推回到失败消息所在时间，并按**资产路径**补缺（半批笔记只补缺的附图，不重写正文与 XML）。分页或群成员失败会登记该群的未完成窗口；前推后的更宽窗口覆盖旧窗口时，旧条目按覆盖关系结清，不按时间戳完全相等判定。
- **验收依据**：`status` 为 success、`failed_by_stage` 归零、`pending_in_scope` 归零、日志 `exit=0 status=success`、`assets_new + assets_filled == manifest_appended`（等于清单实际增行）、清单无重复路径，且缺项文件在盘上可读。仅"退出码变 0"不构成验收；一次正常采集也不能证明隔离与重试分支已在真实环境触发。
- **两条通道**：日跑走 `run_jyq.py`（0/2/1）；工作台手动采集走 `prism-collect.py`，映射为 `complete/partial/failed` 写入 `data/prism-collection/collection-jobs.json`。语义已对齐，作业记录仍分开。
- **dry-run 边界**：执行群成员查询、消息分页、笔记 XML 下载；跳过图片下载与素材/清单写盘，也不写回执与台账；仍创建归档目录与 `.collection.lock`。不要用它证明媒体通道健康，也不要在 21:00 前后跑。
- **未决**：对端为何中断仍未查明（idle 超时／限流／中间设备三说并存）；重试只降低单次中断的后果，不等于根因解决。2026-11-10 的 `SSL: UNEXPECTED_EOF_WHILE_READING` 与 `exit=1` 保留在 `M-jyq.md` 历史条目中，不因本次修复改写。
- **验收记录（2026-11-11 15:33 +08，单群速写群，`--since 2026-11-10`）**：`success`/`exit=0`；`assets_new=0`、`assets_filled=0`、`assets_skipped=35`、`manifest_appended=0`，清单 1813 行未变；其余三群行数不变；只写 `_meta/last_result.json` 与 `_meta/collection_pending.json`（空）。窗口 `2026-11-10T00:00:00+08:00..2026-11-11T15:33:13+08:00`，未前推。**只证明查询/去重/回执链路**；下载成功、素材写盘、重试分支均未触发。
