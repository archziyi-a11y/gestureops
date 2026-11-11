import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { dockIncident, dockIncidentContext } from './dock-incidents.js';

export const REMINDER_COVERAGE = [
  ['对接表追问、配置与重启', '操作回执；不自动发送或重试'],
  ['模型余额', '定时查询'], ['模型连接与重载', '操作回执'],
  ['知识、提示词与物料', '操作回执'], ['工作机更新', '下发与批量回执'],
  ['业务生成质量与耗时', '待接入'], ['服务器、证书与磁盘', '待接入'],
  ['跨项目自动任务与同步', '历史调查，未接实时监测'],
];
const links = { model: '#/p/sales/w/runtime', knowledge: '#/p/sales/w/knowledge', materials: '#/p/sales/w/materials', devices: '#/p/sales/w/devices' };
const sources = { model: 'workbench-prototype-v3/docs/MODEL-CONNECTIONS-20261110.md', knowledge: 'workbench-prototype-v3/src/domain/knowledge.js', materials: 'workbench-prototype-v3/src/domain/team-materials.js', devices: 'workbench-prototype-v3/src/domain/work-device-actions.js' };
const labels = {
  read: '读取连接配置', test: '测试模型连接', reload: '重载模型配置', save: '保存模型配置',
  snapshot: '读取知识库', upload: '上传资料', review: '审核知识', publish: '发布知识', withdraw: '撤回知识',
  query: '回答调试', organize: '整理资料', 'business-snapshot': '读取提示词版本', 'business-save': '保存提示词',
  'business-delete': '删除提示词版本', 'business-release': '实装提示词', 'business-compare': '对比提示词',
  'prompt-save': '保存试问提示词', 'source-snapshot': '读取源文件', 'source-upload': '归档源文件',
  'source-update': '更新源文件', 'source-prepare': '准备整理任务', 'source-download': '下载源文件', 'source-detail': '读取源文件详情',
  list: '读取团队物料', delete: '删除物料', image: '读取物料图片', inventory: '读取工作机清单',
  catalog: '读取安装包', submit: '下发工作机更新',
};
const readActions = new Set(['read','test','snapshot','query','business-snapshot','business-compare','source-snapshot','source-download','source-detail','list','image','inventory','catalog','organize','source-prepare']);
const rank = { severe: 0, unknown: 1, normal: 2 };
export const sortIssues = issues => [...issues].sort((a,b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3) || b.lastSeen.localeCompare(a.lastSeen));

export function issueAsset(issue) {
  return {
    id: issue.id, name: issue.title, category: 0, project: issue.project || 'sales', issue: issue.impact,
    summary: issue.impact, fact: `${issue.status === 'resolved' ? '已恢复' : issue.status === 'unknown' ? '结果待核对' : '待处理'} · ${issue.title}`,
    severity: issue.severity, source: issue.source, incidentKind:issue.kind,
    detail: `问题编号：${issue.id}\n首次观测：${issue.firstSeen}\n最近观测：${issue.lastSeen}\n时钟：工作台服务端；时间含时区\n证据：${issue.evidence}\n检查次数：${issue.occurrences || 1}\n下一步：${issue.next}\n当前状态：${issue.status}\n执行边界：先只读排查；不要重复提交结果未知的操作。真实修改、重启和重试另行确认。`,
  };
}

export function createOperationsReminders({ dir, now = () => Date.now() }) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'operations-reminders.json');
  let rows;
  try { rows = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; rows = {}; }
  let persistenceError = false;
  const at = () => new Date(now()).toISOString();
  // Failure to save an observation must never rewrite a successful business receipt.
  const save = () => { try { writeFileSync(file + '.tmp', JSON.stringify(rows)); renameSync(file + '.tmp', file); persistenceError = false; } catch { persistenceError = true; } };
  function observe(id, detail, stamp = at()) {
    const old = rows[id];
    if (old?.observation === stamp && old?.status === detail.status && old?.title === detail.title && old?.evidence === detail.evidence) return;
    const reopened = !old || old.status === 'resolved';
    rows[id] = { ...old, ...detail, id, project: detail.project || 'sales', observation: stamp, firstSeen: reopened ? stamp : old.firstSeen, lastSeen: stamp, occurrences: reopened ? 1 : (old.occurrences || 1) + (old.observation === stamp ? 0 : 1) };
    if (rows[id].occurrences >= 3 && detail.status !== 'resolved' && detail.escalate !== false) rows[id].handling = 'agent';
    save();
  }
  function resolve(id, stamp = at()) {
    if (rows[id] && rows[id].status !== 'resolved') { rows[id] = { ...rows[id], status: 'resolved', resolvedAt: stamp, lastSeen: stamp }; save(); }
  }
  async function run(meta, execute) {
    const { area, action, target = '', object = '' } = meta;
    const suffix = createHash('sha256').update(`${target}:${object}`).digest('hex').slice(0,16);
    const id = `incident:${area}:${action}:${suffix}`;
    const title = labels[action] || '操作';
    const record = (status, evidence) => observe(id, {
      title: `${area === 'model' ? (target === 'knowledge' ? '知识调试 · ' : '销售业务 · ') : ''}${title}${status === 'unknown' ? '结果待核对' : '失败'}`,
      status, severity: status === 'unknown' ? 'unknown' : 'normal', handling: status === 'unknown' ? 'agent' : 'routine',
      impact: status === 'unknown' ? `${title}尚无确定结果，重复提交可能造成重复操作。` : `${title}未完成，请核对对应操作记录。`, evidence,
      next: status === 'unknown' ? '先核对服务端记录，勿重复提交；无法确认时交给智能体排查。' : '打开对应工作面核对配置与记录；重复失败时交给智能体排查。',
      href: links[area], source: sources[area],
    });
    try {
      const result = await execute();
      const state = result?.status || result?.state;
      if (['unknown','pending','submit_outcome_unknown'].includes(state)) record('unknown', `服务端回执：${state}`);
      else if (['knownfailure','rejected','failed'].includes(state)) record('open', `服务端回执：${state}`);
      else if (result?.connected === false) record('open', '管理连接未建立');
      else if (result?.generationError || result?.baseline?.generationError || result?.augmented?.generationError) record('open', '回答生成或输出校验未完成；具体失败侧见回答调试回执。');
      else if (!['accepted_not_verified','running','preparing','dispatching'].includes(state)) resolve(id);
      if (result?.receiptPersistenceFailed || result?.persistenceWarning) record('unknown', '业务结果已返回，但回执持久化失败；保留原业务结果，不要重复执行。');
      return result;
    } catch (error) {
      record(readActions.has(action) ? 'open' : 'unknown', '工作台未取得有效完成回执；原始错误留在操作工作面，任务上下文不复制凭据或正文。');
      throw error;
    }
  }
  function syncBalance(snapshot) {
    for (const connection of ['sales','knowledge','dock']) {
      const row = snapshot.connections[connection];
      if (!row) continue;
      const label = {sales:'销售业务',knowledge:'知识调试',dock:'对接表主模型'}[connection];
      const base = { project:connection==='dock'?'bridge':'sales', href: connection==='dock'?'#/p/bridge/w/runtime':links.model, source: connection==='dock'?'workbench-prototype-v3/docs/maintenance/DOCK.md':sources.model, handling: 'routine', escalate: false };
      const errorId = `incident:balance-query:${connection}`;
      if (row.error) observe(errorId, { ...base, status:'open', severity:'normal', title:`${label}余额更新失败`, impact:'余额提醒可能滞后，保留上次结果。', evidence:'余额接口未返回有效结果', next:'打开模型连接重新查询；持续失败交给智能体排查。', escalate:true }, row.lastAttemptAt);
      else resolve(errorId, row.checkedAt);
      const id = `incident:balance-low:${connection}`;
      const cny = row.balances?.find(b => b.currency === 'CNY');
      const value = cny && String(cny.total).trim() ? Number(cny.total) : NaN;
      if (Number.isFinite(value) && value < snapshot.threshold) observe(id, { ...base, status:'open', severity: value <= 0 ? 'severe' : 'normal', title:`${label}余额${value <= 0 ? '已耗尽' : '偏低'}`, impact: value <= 0 ? '该账户的模型请求可能被拒绝。' : '模型账户需要及时充值，避免后续请求中断。', evidence:`CNY ${value.toFixed(2)}；阈值 ${snapshot.threshold}；${row.error ? '上次成功查询，更新失败' : '余额接口回执'}`, next:'检查账户余额并充值，或更换可用 Key；重新查询确认恢复。' }, row.checkedAt);
      else if (!row.error && Number.isFinite(value)) resolve(id, row.checkedAt);
    }
  }
  async function runDock(meta, execute) {
    const suffix=createHash('sha256').update(`${meta.action}:${meta.object || ''}`).digest('hex').slice(0,16);
    const prefix=`incident:dock:${suffix}:`;
    let result;
    try { result=await execute(); }
    catch(error) {
      result={ok:false,status:['send','restart','save'].includes(meta.action)?'unknown':'failed'};
      record(result);
      throw error;
    }
    record(result);
    return result;
    function record(value) {
      const issue=dockIncident(meta.action,value);
      if(issue) observe(prefix+issue.kind,{...issue,evidence:`操作：${meta.action}；对象引用：${suffix}${/^[a-f0-9]{8}$/i.test(meta.object||'')?`；批次：${meta.object}`:''}；分类：${issue.kind}`,next:issue.next,context:dockIncidentContext(issue.kind)});
      // A successful preview only clears read failures for that same batch, never unknown sends.
      if(value?.ok===true) for(const kind of ['quota','rate','failure','access']) resolve(prefix+kind);
      if(meta.action==='save' && value?.saved) observe('incident:dock:reload',{project:'bridge',kind:'reload',status:'open',severity:'normal',handling:'routine',escalate:false,title:'对接表新配置等待生效',impact:'配置已保存，当前进程尚未重新加载。',next:'确认后快速重载，再检查受影响操作。',href:'#/p/bridge/w/runtime',actionLabel:'重载配置',source:sources.model,evidence:'配置保存回执：saved=true'});
      if(meta.action==='restart' && value?.ok===true) resolve('incident:dock:reload');
    }
  }
  function syncDock(snapshot) {
    const status=snapshot.service?.status;
    if(['Stopped','Paused'].includes(status)) observe('incident:dock:service',{
      project:'bridge',kind:'service',status:'open',severity:'normal',handling:'routine',escalate:false,
      title:'对接表机器人服务已停止',impact:'机器人当前无法持续接收和处理新请求。',next:'检查服务停止原因，确认后恢复；再核对消息通道。',
      href:'#/p/bridge/w/runtime',actionLabel:'检查机器人服务',source:'Windows Service AFTB-Bot',evidence:`服务状态：${status}`,
    },snapshot.observedAt);
    else if(status==='Running') resolve('incident:dock:service',snapshot.observedAt);
  }
  function syncDeviceReceipts(batches) {
    for (const batch of batches) {
      if (!['partial','failed','interrupted','stopped','submit_outcome_unknown'].includes(batch.state) && !(batch.state==='completed' && batch.results?.some(r=>r.state==='skipped'))) continue;
      observe(`incident:device-batch:${batch.id}`, { title: batch.state === 'partial' ? '工作机更新部分完成' : '工作机更新需核对', status: ['interrupted','stopped','submit_outcome_unknown'].includes(batch.state) ? 'unknown' : 'open', severity: 'unknown', handling:'agent', impact:`批次内 ${batch.results?.length || 0} 台工作机；已下发不等于安装完成。`, evidence:`批次 ${batch.id}；状态 ${batch.state}；原因 ${batch.message || '见逐机回执'}`, next:'先核对逐机回执，只处理尚未完成项，勿重发结果未知项。', href:links.devices, source:'workbench-prototype-v3/src/domain/work-device-batch.js' }, batch.updatedAt || batch.createdAt);
    }
  }
  return {
    run, runDock, syncDock, syncBalance, syncDeviceReceipts,
    assets: () => Object.values(rows).map(issueAsset),
    snapshot: () => ({ issues: sortIssues(Object.values(rows).filter(r => r.status !== 'resolved')), history: Object.values(rows).filter(r=>r.status==='resolved').slice(-30), coverage: REMINDER_COVERAGE, persistenceError, checkedAt: at() }),
    asset: id => rows[id] ? issueAsset(rows[id]) : null,
  };
}
