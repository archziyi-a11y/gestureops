import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const liveRoot = resolve('D:/Dev/smart-customer-service');
const manifestRelative = 'corpus_raw/crm/ifangzhou/jyq/manifest.jsonl';
const receiptRelative = 'corpus_raw/crm/ifangzhou/jyq/_meta/last_result.json';
const taskScript = `$ErrorActionPreference='Stop'; $t=Get-ScheduledTask -TaskName 'jyq-room-fetch-daily'; $i=Get-ScheduledTaskInfo -TaskName 'jyq-room-fetch-daily'; [pscustomobject]@{state=$t.State.ToString();lastRunTime=$i.LastRunTime.ToString('o');lastTaskResult=$i.LastTaskResult;nextRunTime=$i.NextRunTime.ToString('o')} | ConvertTo-Json -Compress`;
const iso = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const failed = (id, source) => ({id, source, status:'unknown', fact:'本地观测不可用', detail:'读取失败或数据格式无效；未将未知结果计为零。', issue:'需要核对本地数据源', severity:'unknown'});
let cachedProbe;
let probeExpires = 0;
async function liveProbe(root) {
  if (!cachedProbe || Date.now() >= probeExpires) {
    probeExpires = Date.now() + 60000;
    cachedProbe = execute(join(root,'.venv/Scripts/python.exe'), ['-B',fileURLToPath(new URL('./local-card-probe.py',import.meta.url))], {windowsHide:true,timeout:55000,maxBuffer:65536,encoding:'utf8'})
      .then(({stdout})=>JSON.parse(stdout)).catch(()=>({}));
  }
  return cachedProbe;
}

// Non-production roots never fall back to the machine's task or Prism data.
export async function readLocalCards({root, dependencies = {}} = {}) {
  if (!root) throw new TypeError('root is required');
  root = resolve(root);
  const observedAt = new Date().toISOString();
  const cards = [];
  let frequency = '采集频率未知';
  let jyqTask = null;
  const production = root.toLowerCase() === liveRoot.toLowerCase();
  let probe = {};
  try { probe = await (dependencies.probe ? dependencies.probe() : production && process.platform === 'win32' ? liveProbe(root) : {}); } catch { /* No raw errors or credentials in card output. */ }
  const timed = iso(probe?.startedAt) && iso(probe?.finishedAt);
  const probeTime = timed ? `本机时钟观测区间 ${probe.startedAt} 至 ${probe.finishedAt}；含时区，最多缓存 60 秒。` : '本次探针无有效时间记录。';
  try {
    if (!dependencies.execFile && (!production || process.platform !== 'win32')) throw Error('unavailable');
    const {stdout} = await (dependencies.execFile || execute)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', taskScript], {windowsHide:true, timeout:10000, maxBuffer:65536, encoding:'utf8'});
    const task = JSON.parse(stdout.replace(/^\uFEFF/, ''));
    if (!['Unknown','Disabled','Queued','Ready','Running'].includes(task.state) || !Number.isInteger(task.lastTaskResult) || !iso(task.lastRunTime) || !iso(task.nextRunTime)) throw Error('invalid');
    jyqTask = {state:task.state, lastTaskResult:task.lastTaskResult, lastRunTime:task.lastRunTime, nextRunTime:task.nextRunTime};
    const stateLabel={Unknown:'调度状态未知',Disabled:'已暂停',Queued:'排队中',Ready:'等待下次采集',Running:'正在采集'}[task.state];
    cards.push({id:'jyq', source:'Windows Task Scheduler: jyq-room-fetch-daily', status:'observed', fact:`${stateLabel} · ${task.lastTaskResult===0?'上次任务正常结束':`上次返回 ${task.lastTaskResult}`}`, detail:`调度器记录：上次启动 ${task.lastRunTime}；下次计划 ${task.nextRunTime}。时间来自本机调度器，含时区；任务结束码不代表媒体完整或 Prism 入库。`, ...(task.lastTaskResult !== 0 ? {issue:'最近任务结果码非零，原因待核对', severity:'unknown'} : {})});
  } catch { cards.push(failed('jyq', 'Windows Task Scheduler: jyq-room-fetch-daily')); }
  // Project only documented fields; never expose the raw receipt to the browser.
  let jyqReceipt = null;
  try {
    const r = JSON.parse((await readFile(join(root, receiptRelative), 'utf8')).replace(/^\uFEFF/, ''));
    if (['success','partial','failed'].includes(r.status)) {
      const number = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
      const parts = typeof r.window === 'string' ? r.window.split('..') : [];
      jyqReceipt = {
        status:r.status, scope:['room','all-whitelist'].includes(r.scope) ? r.scope : null,
        rooms:Array.isArray(r.rooms) ? r.rooms.filter(x=>typeof x==='string' && x.length>0 && x.length<=100).slice(0,4) : [],
        scopeRooms:number(r.scope_rooms), whitelistRooms:number(r.whitelist_rooms),
        finishedAt:iso(r.finished_at) ? r.finished_at : null,
        window:parts.length===2 && parts.every(iso) ? parts : null,
        windowFromPending:typeof r.window_from_pending==='boolean' ? r.window_from_pending : null,
        scanComplete:typeof r.scan_complete==='boolean' ? r.scan_complete : null,
        failedItems:number(r.failed_items), pendingInScope:number(r.pending_in_scope), pendingOutOfScope:number(r.pending_out_of_scope),
        assetsNew:number(r.counts?.assets_new), assetsFilled:number(r.counts?.assets_filled), assetsSkipped:number(r.counts?.assets_skipped),
        stages:Object.fromEntries(['network','write','parse'].map(k=>[k,number(r.failed_by_stage?.[k])]))
      };
    }
  } catch { /* Missing or invalid receipt is unknown. */ }
  cards[0].jyq = {task:jyqTask, receipt:jyqReceipt};
  // 采集回执：退出码只有 0/1/2 三档，语义在 _meta/last_result.json 里。
  // 没有回执时保持旧口径，不用退出码猜“是否正常”。
  // 回执带 scope：单群运行只代表自己，不得让四群定时采集的卡片整体变正常。
  if (cards[0]?.id === 'jyq' && cards[0].status === 'observed') {
    try {
      const receipt = JSON.parse((await readFile(join(root, receiptRelative), 'utf8')).replace(/^\uFEFF/, ''));
      const runStatus = receipt?.status;
      if (['success', 'partial', 'failed'].includes(runStatus)) {
        const scopeRoom = receipt.scope === 'room';
        const scopeAll = receipt.scope === 'all-whitelist';
        const scoped = scopeRoom || scopeAll;
        const scopeNames = Array.isArray(receipt.rooms)
          ? receipt.rooms.filter(name => typeof name === 'string' && name.trim()).slice(0, 4) : [];
        const verb = {success:'完成',partial:'部分完成',failed:'失败'}[runStatus];
        const label = `上次${scopeRoom ? '单群采集' : '采集'}${verb}`;
        const failed = Number.isSafeInteger(receipt.failed_items) && receipt.failed_items >= 0 ? receipt.failed_items : null;
        const pending = Number.isSafeInteger(receipt.pending) && receipt.pending >= 0 ? receipt.pending : null;
        // 范围内与范围外分开：全局 pending 非空不等于本次范围失败。
        const pendingInScope = Number.isSafeInteger(receipt.pending_in_scope) && receipt.pending_in_scope >= 0 ? receipt.pending_in_scope : null;
        const pendingOthers = Number.isSafeInteger(receipt.pending_out_of_scope) && receipt.pending_out_of_scope >= 0 ? receipt.pending_out_of_scope : null;
        const scanOk = receipt.scan_complete === true;
        const rooms = Array.isArray(receipt.scan_incomplete_rooms)
          ? receipt.scan_incomplete_rooms.filter(name => typeof name === 'string' && name.trim()).slice(0, 4) : [];
        const stages = receipt.failed_by_stage && typeof receipt.failed_by_stage === 'object'
          ? Object.entries(receipt.failed_by_stage).filter(([k,n]) => ['network','write','parse'].includes(k) && Number.isSafeInteger(n) && n > 0).map(([k,n]) => `${k} ${n}`).join(' / ') : '';
        const parts = [];
        if (!scanOk) parts.push(`扫描范围未完成${rooms.length ? `（${rooms.join('、')}）` : ''}`);
        if (failed) parts.push(`${failed} 项未完成${stages ? `（${stages}）` : ''}`);
        if (pendingInScope) parts.push(`本次范围待补 ${pendingInScope} 项，下次运行会回看`);
        const finished = iso(receipt.finished_at) ? receipt.finished_at : '时间未知';
        const shortTime = finished.length >= 20 ? `${finished.slice(0, 16)}${finished.slice(19)}` : finished;
        const window = jyqReceipt?.window?.join('..') || '';
        const countOf = key => receipt.counts && Number.isSafeInteger(receipt.counts[key]) ? receipt.counts[key] : null;
        const assetText = [`新增 ${countOf('assets_new')}`, `补齐 ${countOf('assets_filled')}`, `已完成跳过 ${countOf('assets_skipped')}`]
          .filter(text => !text.includes('null')).join(' / ');
        // 单群补采与四群定时任务是两件事：卡面分列，不合并成一句“上次采集”。
        if (scopeRoom) {
          cards[0].fact += ` · 另一次单群补采${verb}（${scopeNames.join('、') || '群未标注'} · ${shortTime}）`;
        } else {
          cards[0].fact += ` · ${label}`;
        }
        if (runStatus !== 'success') {
          Object.assign(cards[0], {issue:`${scopeRoom ? '单群补采' : ''}${runStatus === 'failed' ? '采集失败' : '部分完成'}：${parts.join('；') || '存在未完成项'}`, severity:'unknown'});
        } else if (scopeRoom && pendingOthers) {
          // 单群成功不能盖住其他群的欠账，卡面必须继续报警。
          Object.assign(cards[0], {issue:`单群补采完成，其他群仍有 ${pendingOthers} 项待补`, severity:'unknown'});
        }
        cards[0].detail += ' '
          + (scopeRoom
            ? `单群补采（${finished}）：${verb}；扫描${receipt.scan_complete === true ? '完成' : receipt.scan_complete === false ? '未完成' : '未知'}；未完成 ${failed ?? '未知'} 项；本次范围待补 ${pendingInScope ?? '未知'} 项`
            : `采集回执：${label}（${finished}）；扫描${receipt.scan_complete === true ? '完成' : receipt.scan_complete === false ? '未完成' : '未知'}；未完成 ${failed ?? '未知'} 项；本次范围待补 ${pendingInScope ?? '未知'} 项`)
          + (pendingOthers ? `，其他群待补 ${pendingOthers} 项` : '')
          + (pendingInScope === null && pending !== null ? `，全局待补 ${pending} 项` : '')
          + '。'
          + (assetText ? `资产：${assetText}（新增+补齐应等于清单增行）。` : '')
          + (scoped ? `范围：${scopeRoom ? `单群（${scopeNames.join('、') || '未标注'}）` : '白名单全部群'}`
            + `${scopeRoom ? `，仅覆盖 ${Number.isSafeInteger(receipt.scope_rooms) ? receipt.scope_rooms : '?'}/${Number.isSafeInteger(receipt.whitelist_rooms) ? receipt.whitelist_rooms : '?'} 群，不代表四群定时采集结果` : ''}。` : '')
          + (window ? `实际读取窗口 ${window}${receipt.window_from_pending === true ? '，因待补项前推' : ''}。` : '')
          + (scopeRoom ? '四群定时任务的结果仍以调度器口径与上一份日跑回执为准，本次单群运行不改写它。' : '')
          + ' 状态以 _meta/last_result.json 为准，退出码只说明本轮未全部完成，不说明对端断连原因。';
      }
    } catch { /* 无回执或格式无效时保留调度器口径，不把未知当正常。 */ }
  }
  try {
    if (!dependencies.execFile && (!production || process.platform !== 'win32')) throw Error('unavailable');
    const {stdout} = await (dependencies.execFile || execute)('powershell.exe', ['-NoProfile','-NonInteractive','-Command', "$ErrorActionPreference='Stop'; @( (Get-ScheduledTask -TaskName 'jyq-room-fetch-daily').Triggers | ForEach-Object { [pscustomobject]@{kind=$_.CimClass.CimClassName;enabled=$_.Enabled;days=$_.DaysInterval;start=$_.StartBoundary;repeat=$_.Repetition.Interval} }) | ConvertTo-Json -Compress"], {windowsHide:true,timeout:10000,maxBuffer:65536,encoding:'utf8'});
    const parsed = JSON.parse(stdout.replace(/^\uFEFF/, ''));
    const triggers = Array.isArray(parsed) ? parsed : [parsed];
    if (triggers.length === 1) {
      const t = triggers[0];
      if (t.kind === 'MSFT_TaskDailyTrigger' && Number.isInteger(t.days) && t.days > 0 && iso(t.start) && !t.repeat && typeof t.enabled === 'boolean') frequency = `${t.days === 1 ? '每天' : `每 ${t.days} 天`} ${t.start.slice(11,16)}（${t.start.slice(-6)}）${t.enabled ? '' : '，触发器已禁用'}`;
    }
  } catch { /* Keep unknown frequency independent of task exit status. */ }
  const channel = timed ? {available:'查询通道可用',auth_failed:'通道认证失败',rejected:'通道请求被拒绝',unreachable:'通道连接或配置失败'}[probe.channel?.state] : null;
  cards[0].fact = `${frequency} · ${cards[0].fact} · ${channel || '通道未完成验证'}`;
  cards[0].jyq.frequency = frequency;
  cards[0].jyq.channel = {label:channel || '通道未完成验证',observedAt:timed ? probe.finishedAt : null};
  cards[0].detail += ` ${probeTime} 频率来自实际 Windows trigger。通道探针使用既有采集账号，对四个白名单群各查询最多一条、回看两天，仅统计数量；成功不代表媒体下载端或完整采集成功。`;
  if (channel && probe.channel.state !== 'available') Object.assign(cards[0],{issue:channel,severity:'unknown'});
  try {
    const file = join(root, manifestRelative);
    const before = await stat(file);
    const content = await readFile(file, 'utf8');
    const after = await stat(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw Error('changed');
    const counts = {image:0, wechat_note_image:0, wechat_note:0, wechat_note_xml:0, note:0, other:0};
    let total = 0;
    let latestImage = null;
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (!row || Array.isArray(row) || typeof row !== 'object' || typeof row.asset_type !== 'string') throw Error('invalid');
      const key = Object.hasOwn(counts, row.asset_type) ? row.asset_type : 'other';
      counts[key]++;
      if (['image','wechat_note_image'].includes(key) && iso(row.fetched_at) && Date.parse(row.fetched_at) <= Date.parse(observedAt) && (!latestImage || Date.parse(row.fetched_at) > Date.parse(latestImage))) latestImage = row.fetched_at;
      total++;
    }
    const m = probe.media;
    const mediaValid = timed && m && ['checked','readable','failed'].every(k=>Number.isSafeInteger(m[k]) && m[k]>=0) && m.readable+m.failed===m.checked;
    const mediaFact = mediaValid ? `本地图片可读 ${m.readable}/${m.checked}` : '本地图片可读性未完成验证';
    cards.push({id:'images', source:manifestRelative, status:'observed', dataAsset:{total, images:counts.image + counts.wechat_note_image, latestImage, manifestModifiedAt:after.mtime.toISOString(), media:mediaValid?{checked:m.checked,readable:m.readable,failed:m.failed,startedAt:probe.startedAt,finishedAt:probe.finishedAt}:null}, fact:`${mediaFact} · 归档索引 ${total} 条 · 图片类型记录 ${counts.image + counts.wechat_note_image} 条`, detail:`最近图片归档记录：${latestImage || '未知'}（采集器 fetched_at，自报含时区；不是 Prism 入库时间）。通道：room-fetch → 爱方舟群消息查询 → 媒体下载 → 本地清单。历史产出不代表通道健康，当前查询结果见采集卡。本地逐条核验限定在归档根目录内，只读一个字节确认非空，未做图片解码、未下载新媒体；不代表远端下载端健康。${probeTime} 清单修改时间 ${after.mtime.toISOString()}（本机文件系统 UTC）。`, ...(mediaValid && m.failed ? {issue:`${m.failed} 条图片记录不可读或为空`,severity:'unknown'} : {})});
  } catch { cards.push(failed('images', manifestRelative)); }
  const prismRoot = production ? 'D:/教研资产/Prism' : join(root, 'prism');
  const parts = [];
  let unavailable = false;
  for (const [label, path, directory] of [['数据库',join(prismRoot,'db','ingestion_contract.sqlite3'),false], ['媒体目录',join(prismRoot,'media'),true]]) {
    try {
      const info = await stat(path);
      if (directory ? !info.isDirectory() : !info.isFile()) throw Error('wrong type');
      parts.push(`${label}存在，修改时间 ${info.mtime.toISOString()}`);
    } catch (error) {
      unavailable = true;
      parts.push(`${label}${error.code === 'ENOENT' ? '不存在' : '状态未知'}`);
    }
  }
  let workflow = '刷新方式未知';
  try {
    const sourceRoot = production ? 'D:/Dev/Prism' : join(root,'prism');
    const parsed = JSON.parse(await readFile(join(sourceRoot,'ops/n8n/workflows/prism-feishu-sync-manual.json'),'utf8'));
    const config = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;
    if (Array.isArray(config.nodes) && config.nodes.some(n=>n.type==='n8n-nodes-base.manualTrigger') && !config.nodes.some(n=>/scheduleTrigger|cron/.test(n.type))) workflow = '仓库工作流为手动触发，无定时刷新配置';
  } catch { /* Missing configuration cannot establish a refresh schedule. */ }
  cards.push({id:'prism', source:prismRoot, status:'unknown', fact:'本地资产流程 · 在线服务可用性未确认', detail:`${workflow}；不等同于 n8n 已部署配置。${parts.join('；')}（本机文件系统 UTC）。代码包含 read_api、ingestion 与同步 Job，但资产存在不证明服务运行。2026-09-23 交接记录标注 API 部署待确认；本次未验证鉴权读取、增量入库或教师使用，不能显示正常。`, issue:unavailable ? '本地资产未齐备，服务待验证' : '在线读取与刷新链路待验证', severity:'unknown'});
  const p = probe.prism;
  if (timed && p?.state==='not_started' && ['processes','services','tasks','listeners'].every(k=>p[k]===0) && p.readApiConfigured===false && Array.isArray(p.configuredPorts) && p.configuredPorts.every(v=>Number.isInteger(v.port) && v.listening===false)) {
    Object.assign(cards[2],{status:'observed',fact:'本地资产流程 · 本机 Prism 服务未启动',issue:'本机无已部署运行的 Read API，暂不能在线使用',detail:`${workflow}；仓库配置不代表 n8n 部署。${probeTime} 本机 Prism 相关进程、Windows 服务、计划任务、关联监听均为 0；配置端口 ${p.configuredPorts.map(v=>v.port).join('、') || '无'} 无监听，config/.env 未配置 Read API 地址。现有 read_api 是需显式装配的 WSGI 组件，未发现本机在线实例，因此没有可执行鉴权列表检查的端点。范围仅本机，不推断远端部署。${parts.join('；')}（文件系统 UTC），资产存在不代表教师在线可用。`});
  }
  return {observedAt, cards};
}
