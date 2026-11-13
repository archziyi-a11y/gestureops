# n8n 共享平台独立接手记录

## 范围与时间
- 本机 Windows、Docker 共享 n8n 平台；未进入业务账号或读取执行正文。采样区间 2026-11-11 16:21:28 至 16:21:54，Asia/Shanghai (UTC+08:00)，来源为本机系统时钟 `Get-Date`，未校准；容器启动时间来自 Docker，原值 UTC。
- 实际入口：仓库 `project/docs/OPS.md` §3、`project/harness/n8n/caddy/README.md`、`project/docs/N8N-MIGRATION.md` 及 `workbench-prototype-v3/docs/maintenance/N8N.md`。本机探针 `https://localhost:5678/healthz`；当前 WLAN 观测地址 `192.168.70.58`，仅本次观测，不固化为长期入口。

## 检查与判断
- Docker inspect：`pxkb-n8n` 和 `scs-n8n-caddy` 均 running，启动分别为 2026-11-04 07:29:36.126Z、07:29:36.133Z，RestartCount 均为 0，restart policy 均为 always。计数是当前容器状态，不能证明此前无重建或异常。
- Caddy 发布 0.0.0.0:5678，两个容器同在 `scs-n8n-net`；实际挂载的 Caddyfile 将 TLS 反代至 `pxkb-n8n:5678`。本机 localhost 与当前 WLAN IP 的 `/healthz` 跳过证书校验均 HTTP 200，只证明当时 HTTP 健康响应，不证明 TLS 身份、登录、WebSocket 或业务成功。
- 实际 TLS 握手返回公开证书：自签 `CN=n8n-local`，有效期 2026-07-08 15:28:25 至 2028-10-10 15:28:25（本机转换后的 UTC+08），SAN 为 DNS localhost、IP 127.0.0.1、IP 192.168.61.91。当前 WLAN 192.168.70.58 不在 SAN，存在地址不匹配；localhost 与 127.0.0.1 在 SAN。证书有效期判断依赖未校准的本机时钟。通过 Caddyfile 确认配置证书路径；尝试用证书文件 API 比对指纹失败，故未确认磁盘文件与当前握手证书逐字一致，以上以实际握手为准。
- 本机 Windows curl/Schannel 正常校验 localhost 与 WLAN 地址均报 `SEC_E_UNTRUSTED_ROOT`，HTTP 000；错误先终止于信任链，不能从此单独断言完整的名称验证结果。其他设备系统信任未检查。浏览器登录及 WebSocket 未检查，不能推断可用；本机 LAN 200 也不能证明同网段其他设备可达。
- n8n 实际数据卷 `pxkb_n8n_data` 挂载至 `/home/node/.n8n`，Docker 内卷源 `/var/lib/docker/volumes/pxkb_n8n_data/_data`；Caddy 配置与证书目录以只读 bind 挂载。未检查卷内数据完整性、备份或恢复。
- 登录任务 `SCS-DD-MOD-004-Services` 已启用、Ready，最后运行 2026-11-03 14:02:43（系统本地时间），返回 0；不证明后续重启自启成功。启动脚本包含服务和两个容器的启动逻辑，Docker Engine 未就绪时跳过容器。8765、8766、8767、8768 本机 `/health` 均 200，18789 有监听；这不证明容器到宿主机的连通性、调度启用或业务完成。
- 已审阅联合健康脚本：包含本地 health GET、Docker、计划任务、监听及跳过证书校验的探针；未整体运行，已独立执行授权内对应检查。未执行 POST、工作流或重跑。未检查 Active workflow 列表、历史执行、客户正文及业务结果，分别由业务卡验收。

## 结论与接续
平台进程与本机探针当前可用，但交互入口 TLS 信任和当前 LAN 地址匹配存在问题，不能宣布完整交互可用。根因证据为实际证书 SAN 仍含旧地址、本机信任链不受信任；IP 变化原因及其他设备状态未确认。

需维护负责人先确认稳定访问域名或 IP、使用设备及信任策略，再授权变更：评估为该入口签发含正确 SAN 的证书、配置目标设备信任，并按 Caddy 实际加载方式规划代理变更。涉及共享平台启停须协调 pxkb、pddr、mktci、GEO 等受影响任务，确认窗口及回滚，不能独立重启。验收应在目标设备用正常 TLS 校验确认链与名称、检查有效期及实际证书，再验证登录、WebSocket 和非业务触发的健康访问；业务结果由对应卡负责。证书重签、信任配置、代理变更及启停均未执行。

实际操作只有读取手册、状态与公开证书、GET 健康请求及写本记录和反馈；无代码、共享手册或系统状态变更。手册对检查链无需修改；Caddy README 的历史示例及信任提示不应当作当前地址或已信任的证据。后续从本记录和上述入口接续，先确认稳定入口与授权，再按方案验证。
