# n8n 共享平台维护记录

## 范围与时间

- 本机 Windows，工作目录 `D:/Dev/smart-customer-service`；实际入口为 `INPUT.md`、`workbench-prototype-v3/docs/maintenance/N8N.md`、`project/docs/OPS.md` §3、`project/harness/n8n/caddy/README.md`、`project/docs/N8N-MIGRATION.md`。
- 观测窗口 2026-11-11 16:11:43 至 16:12 之后，Asia/Shanghai (UTC+08:00)，来源本机 `Get-Date`，未校验时钟偏差；不是任务执行或入库时间。

## 观测与判断

- `docker inspect` 定向字段：`pxkb-n8n` 和 `scs-n8n-caddy` 均 running，启动时间分别为 2026-11-04 07:29:36.126Z / 07:29:36.132Z，当前容器 RestartCount 均 0，restart policy 均 always。计数仅针对当前容器，不排除重建或历史重启。
- n8n 挂载 Docker 卷 `pxkb_n8n_data` 到 `/home/node/.n8n`；Caddy 只读挂载仓库 Caddyfile 和 certs，两个容器同在 `scs-n8n-net`；Caddy 绑定 `0.0.0.0:5678`，n8n 无宿主端口绑定。Caddyfile 指向 `pxkb-n8n:5678`。
- 审阅 `project/ops/scripts/dd_mod004_health_check.ps1` 后执行：包含 GET /health、端口监听、容器及计划任务查询、跳过证书验证的 healthz；未见业务触发或持久写入。结果 PASS：8765–8768 的 /health 均 200，18789 监听，两个容器运行，登录任务 enabled/Ready，n8n healthz 正常。监听和健康接口不证明业务完成。
- 独立 curl：`https://localhost:5678/healthz` 跳过证书验证为 200；默认验证失败，Schannel 报不受信任的根。当前 WLAN IPv4 `192.168.70.58`，其 healthz 跳过验证为 200。证书公开字段显示自签 CN=n8n-local，SAN 为 localhost、127.0.0.1、192.168.61.91，未包含当前 WLAN IP；有效期本机显示 2026-07-08 15:28:25 至 2028-10-10 15:28:25。证书未过期但当前 WLAN 地址存在身份不匹配，且本机信任链不通过；不能据此确认其他设备的信任状态。探针成功不证明登录或 WebSocket 正常。
- 计划任务 `SCS-DD-MOD-004-Services` enabled、Ready，登录触发，动作指向 `project/ops/scripts/start_dd_mod004_services.ps1`；容器配置中 `TZ` 和 `GENERIC_TIMEZONE` 均为 Asia/Shanghai。未验证下一次登录实际自启或已发布工作流的启用状态。

## 实际操作及边界

仅读取文档、定向 inspect、网络和证书公开元数据，执行上述健康脚本与 GET 探针；未读取密钥明文、客户正文，未启动、停止、重试、外发、部署或更改服务。未验证浏览器登录、WebSocket、其他设备访问、防火墙、真实任务调度与业务送达，也未确认持久卷内容和恢复能力。无证据判定业务任务失败；各业务验收归对应卡。

## 待决与接续

- 当前平台探针和依赖检查正常，但 LAN 证书地址过期于当前网络配置，访问身份验证未通过。是否需要让当前 WLAN 地址成为稳定交互入口需负责人确认；DHCP 地址可能变化。
- 如需处理，集中申请授权：先确认目标固定地址、访问设备和受影响的 pxkb、pddr、mktci、GEO 等共享任务及维护窗口；审查 `ensure_n8n_https.ps1 -ForceRegenerateCert` 的具体副作用与回滚方案，再获授权后重签及必要的代理更新/重启。验收应在目标设备验证证书链与地址匹配、浏览器登录及 WebSocket，并核对容器/healthz；不以业务补跑代替平台验收。信任部署也需单独确认目标设备及安全策略。不自行执行。
- 接续从本文件和上述手册入口开始，先重新采集 WLAN 地址、证书及容器状态。未修改手册或共享配置；历史报告未作为本次证据。
