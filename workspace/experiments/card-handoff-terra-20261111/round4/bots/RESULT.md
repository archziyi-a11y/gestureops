# Bot 与任务服务：只读维护交接

## 当前结论

- 2026-11-11 16:31:12 +08:00（本机 Windows 时钟，未校时）：`Get-Service` 显示 AFTB-Bot、AFTB-Pilot-Observation、PXKB-Bot 均为 Running，启动类型 Automatic；`Win32_Service` 同样显示 Running/Auto。此为本机服务管理器状态快照，不证明长连接、消息收发或任务业务成功，也不证明无故障。输入中 08:24:59.548Z 是历史观察，并非本次时间。
- 三者 Win32 服务入口均为 `C:\tools\NSSM\win64\nssm.exe`；本机服务注册表非敏感字段显示应用均为仓库 `.venv\Scripts\python.exe`，工作目录为 `D:\Dev\smart-customer-service`。未读取命令参数、环境变量或凭据；实际应用命令及依赖可用性未验证。
- 本次未发现服务停止；未发现足以确认业务故障或根因的证据。未启停、补跑、调用模型、发消息、写远端或修改代码与系统。

## 维护入口和差异

- `project/modules/auto-fill-table-bot/docs/MAINTENANCE.md` 记载 AFTB NSSM、运行命令和日志；`project/modules/brand-pr-workboard/docs/MAINTENANCE.md` 记载 PXKB NSSM 和禁止双实例；`project/docs/OPS.md` 记载 PXKB 状态、依赖与失败诊断。上述命令参数、日志内容和依赖未实测，不能据此确认部署完全一致。
- `project/ops/scripts/ops_status.ps1` 的服务状态段仅检查 AFTB-Bot 和 PXKB-Bot，未覆盖 AFTB-Pilot-Observation；直接用本次三个名称的 `Get-Service` 才覆盖本卡。建议维护负责人确认是否应补充状态脚本和手册中的观察服务入口、依赖、故障分支及验收方式；本轮不修改共享文件。尚未确认这些信息在其他手册中不存在。
- 手册包含重启、前台运行等操作，本轮均不执行；尤其禁止擅自启动第二实例。业务验收应以对应业务回执为准，运行状态不能替代回执。

## 范围及接续

本轮是本机只读状态与手册静态核对，不是模拟测试、真实模型测试、真实隔离操作或生产业务验收。未检查服务日志、消息内容、平台连通性、真实依赖加载、应用参数和业务回执；因此业务可用性、观察服务工作效果及是否存在其他故障均待确认。无需因本次状态正常而补跑。若后续出现具体故障，先限定服务、时间、症状与脱敏证据，按相应维护手册做只读定位；涉及重启、重试、发送、部署或其他写入须另行取得授权。无临时绕过方案。
