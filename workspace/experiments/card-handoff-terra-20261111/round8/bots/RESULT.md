# Bot 与任务服务：只读接手诊断

## 结论与范围

可以接续本机只读维护诊断；不能据此认定端到端业务健康或验收通过。本轮未发现足以确认的当前根因，也未修复、部署、重启、补跑、调用模型或发送消息。禁止业务写入是本次边界，不是接手失败。静态 INPUT 是注册信息和生成器，不是本次测量。

## 本机观测

时间窗口：2026-11-11 18:03:09 至 18:04:49，Asia/Shanghai (+08:00)，Windows 主机时钟；下列为各时点快照而非持续监测。

- Windows 服务管理器：AFTB-Bot、AFTB-Pilot-Observation、PXKB-Bot 均 Running、Auto；NSSM 进程分别 PID 10872、6428、6664。三者 Application 均为仓库 `.venv\Scripts\python.exe`，工作目录均为 `D:\Dev\smart-customer-service`。参数投影分别为 `run_aftb.py bot`、`run_aftb.py pilot-api`、`run_pxkb.py run-bot`；未输出环境和敏感参数。Running 不能证明长连接或消息处理成功。
- 观察服务实际子进程监听 127.0.0.1:8771，GET /health 返回 HTTP 200，`status=ok, module_id=aftb, service=pilot-obs`。其维护实现位于 `project/modules/auto-fill-table-bot/src/aftb/pilot_obs/api.py`；健康函数只返回常量，不检查账本或采集流程。
- 8765、8766、8767、8768 均监听 127.0.0.1；进程命令入口分别为 `run_pxkb.py serve-jobs`、`run_daily.py serve-jobs`、`run_mktci.py serve-jobs`、外部 war-room 的 `geo_job_server.py serve-jobs`。逐项 GET /health 均 HTTP 200，模块分别为 pxkb、pddr、mktci、geo，status 均为 ok。已审查对应处理函数只返回常量；正常访问日志可能产生。这不检查任务依赖、调度或业务结果。
- 共享依赖：`SCS-DD-MOD-004-Services` 计划任务 Enabled、Ready；Docker 的 `pxkb-n8n` 和 `scs-n8n-caddy` 均显示 Up 7 days；127.0.0.1:18789 有监听。均不是任务成功证明，也未验证 n8n HTTPS 通路或工作流。
- 用户所指本机工作台 127.0.0.1:5185 有 node.exe PID 54000 监听，命令投影为 `server.js`。仅凭此无法确认具体工作台实例或页面可用；未能可靠识别进程工作目录，未对未确认的服务发 HTTP 请求。5185 存活与该卡业务状态是不同问题。

## 回执和历史

本轮未检出经授权且可确认当前业务完成的回执；未读取聊天正文、凭据、远端表或业务 payload，也未以调用补造回执。`docs/WORKBENCH-LIVE-AUTOMATION-AUDIT-20261107.md` 是 11 月 7 日历史只读盘点：当时指定窗口的 PXKB/PDDR n8n 执行记录均为 error，顶层错误不足确认根因；该历史线索不能当成当前状态或断言没有其他成功。维护手册中的既往验收和 SOP 同样不是本轮业务证明。

## 接续步骤与边界

1. 只读定位 PID 54000 的工作目录及实际 `server.js`，审查处理路径和副作用后再查工作台快照；不要假设 5185 即源代码中默认端口。
2. 经范围与隐私审查，从既有本机执行元数据/回执分别核对 AFTB、观察服务、PXKB 与四个 Job 的最新执行、成功和失败阶段；记录事件时间、观测时间、时区及来源，不读客户正文。先核查历史 n8n 错误是否仍存在，区分通路、调度、业务和发送结果。
3. 若跨服务故障，先核对共享 n8n、任务启动器和依赖；任何重启须另行授权并协调影响面。Bot 禁双实例；不执行维护手册中写表、发送、模式切换、重试及重启命令。
4. 如需验证真实业务完成，须另行确定授权、测试账号及隔离对象；本轮不能代替此验收。未运行离线测试，也未审查全部诊断脚本和业务代码；可在独立临时目录审查副作用后补做必要离线测试，本轮无故障证据需补跑。

## 手册核对

已对照 AFTB/PXKB MAINTENANCE、OPS 的入口和健康路径；NSSM 观察服务入口及 8771 的维护代码可定位，但 AFTB 手册进程表和旧并列状态脚本仅列两个 Bot，建议在共享手册补充观察服务的独立状态、入口与健康检查及其局限；本轮权限不允许修改。OPS 的 Job health 是存活检查，不应写成业务验收。未完成全部部署位置、依赖及验收方法的逐项全面核验，不能断言手册整体无需更新。
