# Prism 仪表盘取材记录

2026-11-07，Asia/Shanghai。读取源码和文档；未访问生产、凭据、聊天或图片内容，未触发采集。

- D:/Dev/Prism/workspace/agent_bridge/CURRENT.md：2026-09-23 交接，B1 技术复核通过但部署待确认；自动刷新未授权，不能声明每日同步运行。正式资产入库方向是产品决议，不据此宣称已实测完成。
- D:/Dev/Prism/services/read_api/README.md 及 production.py/acl.py：身份与 ACL、显式生产仓储、SQLite 只读；本机部署不等于公网服务。
- D:/Dev/Prism/services/feishu_sync_job/src/prism_sync/job_server.py：批次回执、dry-run、媒体失败、ingestion 接收/重复/警告；批次成功需与媒体完整性分列。
- D:/Dev/Prism/services/ingestion/src/prism_ingestion/server.py：接入事件和媒体写入，不代表教师消费。
- project/modules/jiaoyan-qun-archive/src/jyq/room_fetch.py、manifest.py 及 docs/DEV_ENTRY.md：独立微信教研采集、本地清单；四群白名单，跳过普通闲聊。不是 Prism 平台入库回执。

页面四区：来源更新、入库完整性、权限读取、备课消费。移除 Prism 仪表盘演示的 22/24 和服务在线结论；其他作业演练数据不改。工作台尚无真实只读采集适配器，各实时指标未知。备课消费接口未确认，后续先做资源对应和小范围真实查找验证，不用资料总数代表使用效果。
