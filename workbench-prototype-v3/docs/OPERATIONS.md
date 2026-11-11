# 运行与数据说明

## 本机启动

在用户本机 PowerShell 执行：

```powershell
& 'D:\Dev\smart-customer-service\workbench-prototype-v3\start-workbench.ps1'
```

启动器检查5185，复用已有服务；端口被其他服务占用时停止启动，不杀进程。日志在 `$env:LOCALAPPDATA\YiliWorkbench\spatial-demo\server.stdout.log` 与 `server.stderr.log`。工作台服务与远端销售API、机器人、n8n是不同进程，重启工作台不能代替重启它们。

直接 `node server.js` 默认5183、当前启动目录下的data目录；从项目目录启动才是仓库data。仅在明确测试数据位置后使用。隔离测试必须指定独立 STATE_DIR，不能把测试重置作用于现用目录。启动器复用已有服务只检查接口返回ok，不替代对该进程数据目录的核对。

## 数据位置

桌面启动器状态根为 `%LOCALAPPDATA%\YiliWorkbench\spatial-demo`，以实际运行进程为准。

| 内容 | 根目录下的位置 |
| --- | --- |
| 作业状态 | state.json |
| 空间总览与草稿 | workspace.json |
| 知识、试问与源文件库 | knowledge/ |
| 不可覆盖原件 | knowledge/source-library/originals/ |
| 来源、用途与关联 | knowledge/source-library/sources.sqlite3 |
| 知识草稿、版本与发布数据 | knowledge/knowledge.sqlite3 |

其他运行目录以 `server.js` 中 STATE_DIR 的消费者为准；业务服务、Prism归档和方舟数据不全在此根目录。凭据按各维护手册定位，仅引用不展示值。

### 核对正在使用的实例

在运行工作台的同一台 Windows 机器上执行。第二条依赖 Python 的 psutil；权限不足或模块缺失时先说明限制，不把仓库目录当成实测结果。

```powershell
$workbenchPid = (Get-NetTCPConnection -LocalPort 5185 -State Listen).OwningProcess | Select-Object -First 1
python -c 'import psutil,pathlib,sys; p=psutil.Process(int(sys.argv[1])); cwd=p.cwd(); state=p.environ().get("STATE_DIR"); print("cwd:",cwd); print("STATE_DIR:",str((pathlib.Path(cwd)/state).resolve()) if state else str(pathlib.Path(cwd)/"data"))' $workbenchPid
```

该命令只输出启动目录和 STATE_DIR，不输出进程的其他环境变量。恢复后还需从当前页面或对应接口回读数量，再抽查原件下载及来源关联，不能仅凭脚本退出成功验收。

## 资料库恢复案例

2026-11-11（北京时间）原件库从仓库 `data/knowledge/source-library` 接入现用目录，接口复核33份、7份待整理、37条来源。这是当次基线，不是当前固定数量。

同一路径曾被两个进程读出不同大小、哈希和数量，原因未定；用户管理员终端执行后接口恢复。不能仅比较路径或本地文件存在就宣布恢复。

`scripts/reconnect_source_library.py SOURCE TARGET` 仅支持目标空库或完全相同的源记录；自动备份、逐原件验哈希、保留来源和事件。源库存在知识关联时拒绝，需将 sources.sqlite3 中 links 与 knowledge/knowledge.sqlite3 中的对应文档、版本一并核对后规划迁移；实现见 scripts/source_library.py 与 project/modules/marketing-chat-insight/src/mktci/sales_knowledge_store.py（后者相对仓库根）。不用于合并两份不同的非空库。禁止用重新上传替代历史恢复。

## 维护与升级

修改前保留当前版本与数据备份；SQLite用backup接口或已停写的一致性快照，不在写入期间直接复制数据库冒充一致备份。先检查进行中作业，再安排本机重启；远端部署按对应项目手册和当次授权进行。

更新后检查HTTP可访问、实际API返回、页面呈现及相关业务回执。前端静态文件修改通常刷新即可，Node模块修改需重启。不要删除整个状态目录来解决单项错误。备份包含业务资料，应限制访问，不提交Git或上传公共位置。
