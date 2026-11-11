import { execFile } from 'node:child_process';

const execute = (file, args, options) => new Promise((resolve, reject) => {
  execFile(file, args, options, (error, stdout) => error ? reject(error) : resolve(stdout));
});
const source = 'pxkb-n8n SQLite OPEN_READONLY；工作流计划、执行状态与最近错误分类；不返回执行正文或凭据';
const program = `
const sqlite = require('/usr/local/lib/node_modules/n8n/node_modules/sqlite3');
const flat = require(require.resolve('flatted',{paths:['/usr/local/lib/node_modules/n8n']}));
const classify = text => /quota.*exceeded/i.test(text) ? 'quota' : /NO availability/i.test(text) ? 'recipient' : /DASHBOARD_URL/.test(text) ? 'dashboard' : /Extra data|JSON|non-JSON|invalid_json/i.test(text) ? 'response_format' : /429|rate.limit/i.test(text) ? 'rate_limit' : /SSL|connect|timeout/i.test(text) ? 'connection' : 'other';
const db = new sqlite.Database('/home/node/.n8n/database.sqlite', sqlite.OPEN_READONLY, error => {
  if (error) return process.exit(1);
  db.all(
    \`SELECT w.name AS workflow, e.status AS status, COUNT(e.id) AS count,
      MIN(e.startedAt) AS firstStartedAt, MAX(e.startedAt) AS lastStartedAt,
      MAX(e.stoppedAt) AS lastStoppedAt
    FROM workflow_entity w LEFT JOIN execution_entity e ON e.workflowId = w.id
      AND julianday(e.startedAt) >= julianday(?) AND julianday(e.startedAt) < julianday(?)
    WHERE (UPPER(w.name) LIKE '%PDDR%' OR UPPER(w.name) LIKE '%PXKB%')
    GROUP BY w.id, w.name, e.status ORDER BY w.name, e.status\`,
    [process.argv[1], process.argv[2]], (error, rows) => {
      if (error) return db.close(() => {process.exitCode=1});
      db.all(\`SELECT w.name,w.active,w.nodes,w.settings,e.status,e.startedAt,e.stoppedAt,x.data
        FROM workflow_entity w LEFT JOIN execution_entity e ON e.workflowId=w.id
          AND e.id=(SELECT MAX(e2.id) FROM execution_entity e2 WHERE e2.workflowId=w.id)
        LEFT JOIN execution_data x ON x.executionId=e.id
        WHERE (UPPER(w.name) LIKE '%PDDR%' OR UPPER(w.name) LIKE '%PXKB%')\`,(error,latest)=>{
        if(!error) process.stdout.write(JSON.stringify({rows,latest:latest.map(row=>{
          let reason=null;
          if(row.data && ['error','crashed','canceled'].includes(row.status)){
            const value=flat.parse(row.data);
            for(const runs of Object.values(value.resultData?.runData||{})) for(const run of runs){
              const json=run.data?.main?.[0]?.[0]?.json;
              if(json?.machine_fields?.error) reason=classify(String(json.machine_fields.error));
            }
            reason ??= classify(String(value.resultData?.error?.message||''));
          }
          const schedule=JSON.parse(row.nodes).filter(n=>n.type==='n8n-nodes-base.scheduleTrigger').flatMap(n=>n.parameters?.rule?.interval||[]).map(i=>i.expression||i.field).filter(Boolean);
          const webhook=JSON.parse(row.nodes).some(n=>n.type==='n8n-nodes-base.webhook');
          return {workflow:row.name,active:!!row.active,status:row.status,time:row.stoppedAt||row.startedAt,reason,schedule,trigger:webhook?'webhook':schedule.length?'schedule':'other',timezone:JSON.parse(row.settings||'{}').timezone||'instance'};
        })}));
        db.close(()=>{process.exitCode=error?1:0});
      });
    });
});`;

function beijing(value) {
  const utc = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(' ','T')+'Z';
  return new Date(new Date(utc).getTime() + 8 * 3600000).toISOString().replace('T', ' ').replace('Z', ' +08:00');
}

export function createReportCardReader({ run = execute, now = () => new Date(), timeoutMs = 10000 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10000) throw new Error('Invalid timeout');
  return async function readReportCards({ root }) {
    const end = now().toISOString();
    const start = new Date(Date.parse(end) - 7 * 86400000).toISOString();
    const window = `UTC [${start}, ${end}); 北京时间 [${beijing(start)}, ${beijing(end)})，按 startedAt，本机时钟；未校验容器时钟偏差。`;
    const base = { id: 'reports', source };
    const controller = new AbortController();
    let timer;
    try {
      const output = await Promise.race([
        run('docker', ['exec', 'pxkb-n8n', 'node', '-e', program, start, end], {
          cwd: root, encoding: 'utf8', windowsHide: true, timeout: timeoutMs, maxBuffer: 131072, signal: controller.signal,
        }),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeoutMs); }),
      ]);
      const parsed = JSON.parse(output);
      const {rows,latest} = parsed;
      if(!Array.isArray(latest)||latest.some(r=>typeof r.workflow!=='string'||typeof r.active!=='boolean'||!Array.isArray(r.schedule))) throw new Error('invalid');
      if (!Array.isArray(rows) || rows.some(r => !r || typeof r.workflow !== 'string' || !/PDDR|PXKB/i.test(r.workflow)
        || !Number.isSafeInteger(r.count) || r.count < 0 || (r.count > 0 && typeof r.status !== 'string')
        || ['firstStartedAt', 'lastStartedAt', 'lastStoppedAt'].some(k => r[k] != null && !Number.isFinite(Date.parse(r[k]))))) throw new Error('invalid');
      let total = 0, success = 0, failed = 0, other = 0;
      for (const row of rows) {
        total += row.count;
        if (row.status === 'success') success += row.count;
        else if (['error', 'crashed', 'canceled'].includes(row.status)) failed += row.count;
        else other += row.count;
      }
      const active = latest.filter(r=>r.active);
      const broken = active.filter(r=>['error','crashed','canceled'].includes(r.status));
      const reasons={quota:'飞书 Bitable 月度配额已用尽，取数受阻',recipient:'飞书机器人对收件人不可用，需核对应用范围与收件标识',dashboard:'汇总看板地址未配置',response_format:'JSON 解析失败，解析位置待核实',rate_limit:'平台调用受限',connection:'外部连接失败',other:'执行失败，需排查'};
      const blockedReasons=[...new Set(broken.map(r=>reasons[r.reason]||reasons.other))];
      const issue = broken.length ? blockedReasons.join('；') : null;
      const daily=broken.filter(r=>/pddr/i.test(r.workflow));
      const summary=daily.length?`日报生成受阻：${reasons[daily[0].reason]||reasons.other}${broken.length>daily.length?'；汇总提醒也有异常':''}`:broken.length?`汇总提醒受阻：${blockedReasons.join('；')}`:active.length===0?'自动提醒未启用':active.every(r=>r.status==='success')?'最近一轮日报与提醒已执行完成':'等待自动任务结果';
      const schedules=active.filter(r=>/pddr/i.test(r.workflow)).flatMap(r=>r.schedule.map(s=>{
        const m=/^(\d+) (\d+) \* \* \*$/.exec(s);
        return m?`${m[2].padStart(2,'0')}:${m[1].padStart(2,'0')}（${r.timezone}）`:s;
      }));
      return { observedAt: end, cards: [{ ...base, status: 'observed',
        report: {tasks: latest.map(r=>({...r,reasonLabel:r.reason?reasons[r.reason]||reasons.other:null})), counts:{total,success,failed,other}, window},
        fact: summary,
        summary:`${schedules.length?`日报每天 ${schedules.join('、')}。`:''}${broken.length?`${broken.length} 条自动任务最近未完成；需先解除阻塞，不补发历史通知。`:'查看最近执行与送达依据。'}`,
        detail: latest.map(r=>`${r.workflow}：${r.active?'已启用':'未启用'}；${r.trigger==='webhook'?'外部/手动触发，无执行不判故障':`计划 ${r.schedule.join(' / ')||'触发类型待核实'}（${r.timezone}）`}；最近结果 ${r.status||'无执行'}${r.time?`，${beijing(r.time)}`:''}${r.reason?`；错误分类（非原文）：${reasons[r.reason]||reasons.other}`:''}`).join('；')+'. '+window+`近7天保留记录 ${total} 次，成功 ${success}，失败/取消 ${failed}，其他 ${other}。`+rows.map(r => `${r.workflow}: ${r.status ?? '无执行'} ${r.count} 次${r.lastStartedAt ? `，最近开始 ${beijing(r.lastStartedAt)}` : ''}${r.lastStoppedAt ? `，最近结束 ${beijing(r.lastStoppedAt)}` : ''}`).join('；')
          + '。仅名称含 PDDR/PXKB 的相关工作流执行统计，不保证均为日报；success 不证明内容正确或送达。',
        ...(issue ? { issue, severity: 'unknown' } : {}),
      }] };
    } catch {
      return { observedAt: end, cards: [{ ...base, status: 'unknown', fact: '执行汇总读取不可用',
        detail: window + '未取得有效只读聚合；未使用快照或估算，不能视为零失败。',
        issue: '容器、运行库、数据库、权限、超时或聚合格式存在读取缺口', severity: 'unknown' }] };
    } finally { clearTimeout(timer); }
  };
}

export const readReportCards = createReportCardReader();
