export const initialMigration = () => ({ host: '', user: '', port: '22', auth: 'key', credential: '', note: '', access: 'keep', downtime: 'confirm' });
export function migrationErrors(d) {
  const errors = {};
  if (!d.host.trim() || !/^[a-zA-Z0-9.:[\]-]+$/.test(d.host.trim())) errors.host = '填写服务器 IP 或域名，不含协议或路径';
  if (!/^[a-zA-Z_][a-zA-Z0-9_.-]*\$?$/.test(d.user.trim())) errors.user = '填写服务器登录账号';
  if (!/^\d+$/.test(d.port) || Number(d.port) < 1 || Number(d.port) > 65535) errors.port = '端口需为 1–65535';
  if (/-----BEGIN|PRIVATE KEY|\r|\n/i.test(d.credential)) errors.credential = '这里只填写凭据名称或本地路径，不粘贴私钥内容';
  if (/-----BEGIN[^\n]*PRIVATE KEY/i.test(d.note)) errors.note = '请移除备注中的私钥内容';
  return errors;
}
export function migrationTask(d, inspection) {
  if (Object.keys(migrationErrors(d)).length) throw Error('迁入环境信息不完整');
  const base = 'D:/Dev/smart-customer-service';
  return `销售助手服务器迁移任务

用户提供的迁入环境（仅为输入信息，不是已核实事实）：
${JSON.stringify({ address: d.host.trim(), port: Number(d.port), account: d.user.trim(), authentication: d.auth === 'key' ? '本地私钥引用' : '已有连接或云端登录', credentialReference: d.credential.trim() || '接手时向用户取得，不索要聊天明文', note: d.note.trim() }, null, 2)}

目标：将销售助手迁入该环境，保留业务资料、团队物料与已有工作机的可用性。
访问安排：${d.access === 'keep' ? '优先保持原访问地址与工作机使用方式；不可保持时说明影响并征求确认。' : '允许规划新访问地址；先提出地址与工作机调整方案，由用户确认。'}
停机安排：${d.downtime === 'confirm' ? '先准备新环境，不中断现有服务；确需停写时再提出具体时长并取得授权。' : '用户愿意安排维护窗口，具体开始时间、时区和可接受时长仍需确认；不能立即停服。'}
旧服务：验证并切换前保持运行；旧部署与数据保留，删除另行确认。

从以下入口自行核查，不要求用户重新填写可发现的镜像、路径、卷、哈希：
1. ${base}/project/modules/qm-sales-assistant/docs/SERVER-MIGRATION-DEPLOYMENT-SOP.md
2. ${base}/docs/SALES-MIGRATION-RETROSPECTIVE-20261109.md
3. ${base}/workspace/experiments/sales-isolated-migration-handoff/ROUND7-TOOL-FIX-RESUME-LOCAL-TLS-20261109.md
4. 历史候选材料 D:/SASALELE-BACKUP-20261109/WORKBUDDY-HANDOFF.md、tools-v2/、HANDOFF-CHECKPOINT-WORKBUDDY.json。

候选包本机检查：${inspection ? JSON.stringify({ checkedAt: inspection.checkedAt, clock: '本地服务端 UTC', ok: inspection.ok, files: inspection.files, tools: inspection.tools }) : '尚未取得；由接手智能体核查，不阻止开始调查。'}
这是2026-11-09快照，不代表当前最新业务数据。必须核对源端当前版本和增量，决定是否重新备份；包缺失/哈希不符时不得用于恢复，但应继续定位可用来源。既有检查点只适用于它记录的资源，不能套用到新环境。

工作顺序：核实目标身份、连接与权限 → 调查已有服务和资源，给出不覆盖方案 → 核对源版本和数据范围 → 明确本次影响及执行授权 → 恢复/部署 → 验证业务 → 请求切换确认。
本任务允许开始只读调查与方案准备。复制不是写入、停服、切流或删除授权；不要未经确认修改源端或目标端。不能把认证问题默认归因为密钥未绑定或要求重启。优先使用可用传输通道，不限定云厂商。
SSH认证与备份解密密钥是两种不同凭据。仅通过获准的本地引用或安全渠道使用，禁止写入提示词、日志、仓库或回执。若智能体不在同一设备，先说明材料不可达并安排受控传递，不假装已读取。
验收须区分：进程/健康、未授权拒绝、物料字段与图片、原工作机访问、上游业务、入口/TLS。历史隔离测试不替代本次结果。对现有环境接续时先核对资源身份，不重复灌卷；未知结果先核查再重试。
回报员工关心的事：当前进度、原服务是否受影响、需要的决定、资料与工作机是否验证通过、是否可切换。另留可被新会话接续的资源身份、已完成/失败/未知步骤、证据和暂存清理记录。`;
}
