import {dockFollowupView,initDockFollowup} from './dock-followup.js';
import {dockBatchBoard} from './dock-batch-board.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let services, snapshot, pending, error = '', active = '', detail, detailError = '', detailBusy = false;
let detailGeneration = 0;
let selectedBatch = '';
let boardZoom=75, boardGrain='day', boardQuery='';
const time = value => value != null && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',hour12:false}) + ' 北京时间' : '未记录时间';
const labels = {running:'运行中',stopped:'已停止',missing:'未找到数据源',unavailable:'读取失败',unknown:'结果待核对',partial:'部分完成',failed:'未完成',completed:'已完成',cancelled:'已取消',pending:'待确认',expired:'已过期',observed:'已读取',ready:'已就绪',committed:'已提交',succeeded:'已完成',success:'已完成',blocked:'待补充',failed_or_unknown:'失败或待核对'};
Object.assign(labels, {Running:'运行中',Stopped:'已停止',Paused:'已暂停',StartPending:'启动中',StopPending:'停止中',available:'已读取',not_found:'未找到该批次',done:'处理结束',superseded:'已被新预览替代',duplicate:'重复项已跳过',preparing:'准备中',creating:'创建中',uncertain:'结果待核对',schema_pending:'字段待核对',master_pending:'总表待处理',withdrawn:'已撤回',child_attempted:'个人表已尝试写入',child_uncertain:'个人表结果未知',master_attempted:'总表已尝试写入',master_uncertain:'总表结果未知'});
const label = value => labels[value] || value || '未记录';
const empty = text => `<p class="sales-empty">${esc(text)}</p>`;
const rows = items => items.map(([name,value]) => `<div class="sales-row"><strong>${esc(name)}</strong><span>${esc(value)}</span></div>`).join('');
const sourceNotice = (source, none) => source?.status === 'available' ? empty(none) : `<p role="status">${esc(label(source?.status || 'unknown'))}；不能据此判断没有记录。</p>`;
const truncated = source => source?.truncated ? '<p role="status">结果已截断，当前列表不是全部记录。</p>' : '';
const account = item => item.displayName || `账号引用：${item.accountRef || '未记录'}`;
const configGroups = [
  ['飞书机器人', '接收消息和发送回复', ['AFTB_APP_ID','AFTB_APP_SECRET']],
  ['品宣市场数据表', '个人表与总表的读写目标', ['AFTB_BITABLE_APP_TOKEN','AFTB_MKT_DOCK_TABLE_ID']],
  ['业务能力', '个人表创建、总表同步及 Excel 导入开关', ['AFTB_MKT_EMPLOYEE_TABLES_ENABLED','AFTB_MKT_EMPLOYEE_MIRROR_ENABLED','AFTB_MKT_EXCEL_IMPORT_ENABLED']],
  ['入学业务依赖', '独立业务配置，不用于修改品宣市场表绑定', ['ADMS_APP_ID','ADMS_APP_SECRET','ADMS_BITABLE_APP_TOKEN']],
];
const configNames = {AFTB_APP_ID:'机器人应用 ID',AFTB_APP_SECRET:'机器人应用密钥',AFTB_BITABLE_APP_TOKEN:'品宣市场多维表格',AFTB_MKT_DOCK_TABLE_ID:'市场总表',AFTB_MKT_EMPLOYEE_TABLES_ENABLED:'个人表',AFTB_MKT_EMPLOYEE_MIRROR_ENABLED:'同步到总表',AFTB_MKT_EXCEL_IMPORT_ENABLED:'Excel 导入',ADMS_APP_ID:'入学应用 ID',ADMS_APP_SECRET:'入学应用密钥',ADMS_BITABLE_APP_TOKEN:'入学多维表格'};
const configContent = config => `${config?.status !== 'available' ? sourceNotice(config, '') : ''}${configGroups.map(([name,purpose,keys])=>`<section class="prism-item"><h3>${name}</h3><p class="sub">${purpose}</p>${rows((config?.items||[]).filter(c=>keys.includes(c.key)).map(c=>[configNames[c.key],c.enabled===true?'已启用':c.enabled===false?'未启用':c.configured?'已配置':'未配置']))}</section>`).join('')}<details><summary>配置来源</summary>${rows([['读取来源',config?.source || '未知'],['进程生效状态',label(config?.runtimeEffective || 'unknown')]])}</details>`;
const tableLink = (url, name) => {
  try { const u=new URL(url); if(u.protocol==='https:' && /(^|\.)feishu\.cn$/.test(u.hostname)) return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${name} ↗</a>`; } catch {}
  return `<span>${name}：缺少完整链接</span>`;
};

// Public presentation functions are also exercised without a browser in contract tests.
export function dockManagementContent(face, data) {
  if (!data) return empty('正在读取对接表记录…');
  if (face === 'tables') {
    const bindings = data.bindings?.items || [];
    return `<section><h2>账号与表绑定</h2><p class="sub">本地绑定记录，不代表当前飞书访问权限。</p>${bindings.length ? bindings.map(b => `<article class="prism-item"><h3>${esc(account(b))}</h3><div class="sales-row">${tableLink(b.childTableUrl,'打开个人表')}${tableLink(b.masterTableUrl,'打开总表')}<span>${esc(label(b.state))}</span></div></article>`).join('') : sourceNotice(data.bindings, '已读取，暂无账号绑定记录。')}${truncated(data.bindings)}</section>`;
  }
  if (face === 'batches') {
    const batches = data.batches?.items || [];
    return `<div data-dock-board-host>${dockBatchBoard(batches,{label,account,zoom:boardZoom,grain:boardGrain,query:boardQuery,selected:selectedBatch})}</div>${!batches.length?sourceNotice(data.batches,'已读取，暂无导入批次。'):''}${truncated(data.batches)}<dialog class="dock-batch-dialog" data-dock-batch-dialog aria-label="批次详情"><button class="dock-dialog-close" data-dock-live="close" aria-label="关闭批次详情" title="关闭">×</button><div data-dock-batch-detail aria-live="polite"></div></dialog>`;
  }
  const mirror = data.receipts?.mirror;
  return `<section><div class="management-service"><div><h2>服务检查</h2><p>${esc(data.service?.name || 'AFTB-Bot')} · ${esc(label(data.service?.status))}</p></div></div>${rows([['业务健康',label(data.service?.businessHealth || 'unknown')],['运行版本','尚未核验']])}<h2>镜像阶段汇总</h2>${mirror?.items?.length ? rows(mirror.items.map(r=>[label(r.phase),r.count])) : sourceNotice(mirror,'已读取，暂无镜像记录。')}${truncated(mirror)}<p class="sub">本地持久记录，未进行远端双表读回。</p><details class="management-evidence"><summary>配置与部署依据</summary>${configContent(data.config)}</details></section>`;
}

export function dockManagementView(face) {
  const runtime = face === 'runtime' || face === 'deployment';
  return `<section data-dock-management="${esc(face)}" aria-busy="${!!pending}"><div class="management-toolbar"><p class="sub" data-dock-read-time>${snapshot ? '观测结束于 '+esc(time(snapshot.observedAt))+'（本机时钟）' : pending ? '正在读取本机业务记录' : '尚无读取结果'}</p><button class="btn" data-dock-live="${runtime?'diagnose':'refresh'}" ${pending?'disabled':''}>${pending?'正在读取…':runtime?'只读检查':'重新读取'}</button></div>${error ? `<p role="alert">${esc(error)}${snapshot?'；下方保留上次读取结果。':''}</p>` : ''}${error && !snapshot ? '' : dockManagementContent(face,snapshot)}</section>`;
}

function paint() {
  const host=document.querySelector('[data-dock-management]');
  if (!host) return;
  const face=host.dataset.dockManagement;
  host.outerHTML=dockManagementView(face);
  paintDetail();
}
function paintDetail() {
  const host=document.querySelector('[data-dock-batch-detail]');
  if (!host) return;
  if (detailBusy) {host.innerHTML='<p role="status">正在核对批次回执…</p>';return;}
  if (detailError) {host.innerHTML=`<p role="alert">${esc(detailError)}</p>`;return;}
  if (!detail) {host.innerHTML='<div class="dock-batch-empty"><h3>未选择批次</h3></div>';return;}
  host.innerHTML=dockManagementDetail(detail);
}
export function dockManagementDetail(data) {
  const b=data.batch?.item, receipts=data.receipts;
  if (!b) return sourceNotice(data.batch, '暂无批次记录。');
  return `<section class="management-detail"><header class="dock-batch-heading"><div><p class="sub">${esc(account(b))}</p><h3>${esc(b.id)}</h3></div><span class="dock-batch-state">${esc(label(b.status))}${b.expired?' · 已过期':''}</span></header><p class="dock-batch-created sub">创建于 ${esc(time(b.created * 1000))}</p>${dockFollowupView(b.id)}<section class="dock-batch-outcomes"><h4>已登记处理结果</h4><div class="dock-batch-metrics">${Object.entries(b.counts || {}).map(([key,value])=>`<div><span>${esc(label(key==='failed'?'failed_or_unknown':key))}</span><strong>${esc(value)}</strong></div>`).join('') || '<p class="sub">尚无逐项处理结果</p>'}</div></section><details class="dock-batch-receipts"><summary>逐项回执与读取依据</summary><p class="sub">观测结束于 ${esc(time(data.observedAt))}</p><h4>全部已登记行计数</h4>${rows(Object.entries(b.counts || {}).map(([key,value])=>[label(key === 'failed' ? 'failed_or_unknown' : key),value]))}${receipts?.status !== 'available' ? sourceNotice(receipts,'') : receipts.items?.length ? receipts.items.map(r=>`<div class="sales-row"><span>第 ${esc(r.position + 1)} 项</span><span>${esc(label(r.outcome || r.status))}</span><span>${esc(r.recordRef || '')}</span></div>`).join('') : empty('已读取，暂无逐项回执。')}${truncated(receipts)}<p class="sub">已完成项不重复提交；失败或未知结果须先核对。这是批次项目次序，不是 Excel 原始行号。</p></details></section>`;
}
async function request(action, body={}) {
  const write=action==='diagnose';
  const query=new URLSearchParams({action,...body});
  const response=await fetch('/api/dock-management'+(write?'':'?'+query),write?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...body})}:{});
  const data=await response.json();
  if (!response.ok || data.error) throw Error('对接表读取未完成，请核对本地服务与数据源。');
  return data;
}
async function load(action='overview') {
  if (pending) return pending;
  error='';
  detail=null;detailError='';
  detailGeneration++;detailBusy=false;
  pending=request(action).then(data=>{snapshot=data;}).catch(()=>{error='对接表读取未完成，请核对本地服务与数据源。';}).finally(()=>{pending=null;paint();});
  paint();
  return pending;
}
export function initDockManagement(value) {
  initDockFollowup();
  services=value;
  document.addEventListener('click',async event=>{
    const grainButton=event.target.closest('[data-dock-grain]');
    if(grainButton){boardGrain=grainButton.dataset.dockGrain;paintBoard();return;}
    const button=event.target.closest('[data-dock-live]');
    if (!button) return;
    const action=button.dataset.dockLive;
    if(action==='close'){document.querySelector('[data-dock-batch-dialog]')?.close();return;}
    if (action==='refresh' || action==='diagnose') {await load(action==='refresh'?'overview':'diagnose');if(!error)services.notify('已返回读取结果，请核对各项状态');return;}
    if((action==='batch'||action==='followup') && !detailBusy) {
      selectedBatch=button.dataset.id;
      document.querySelectorAll('[data-dock-live="batch"]').forEach(row=>row.setAttribute('aria-pressed',String(row.dataset.id===selectedBatch)));
      detail=null;detailError='';detailBusy=true;paintDetail();
      document.querySelectorAll('[data-batch-card]').forEach(row=>row.dataset.selected=String(row.dataset.batchCard===selectedBatch));
      const dialog=document.querySelector('[data-dock-batch-dialog]');
      if(dialog&&!dialog.open)dialog.showModal();
      const generation=++detailGeneration;
      try{const result=await request('batch',{id:button.dataset.id});if(generation===detailGeneration)detail=result;}catch{if(generation===detailGeneration)detailError='批次读取未完成，结果未知；未执行重试或写入。';}finally{if(generation===detailGeneration){detailBusy=false;paintDetail();if(action==='followup'&&detail&&dialog?.open)document.querySelector('[data-followup-action="preview"]')?.click();}}
    }
  });
  document.addEventListener('input',event=>{
    if(event.target.matches('[data-dock-zoom]')){
      boardZoom=Number(event.target.value);
      const board=document.querySelector('[data-dock-board]');
      board.style.setProperty('--batch-column',`${160+boardZoom*1.8}px`);
      board.dataset.density=boardZoom<25?'timeline':boardZoom<55?'compact':'cards';
      document.querySelector('[data-dock-zoom-label]').textContent=boardZoom<25?'时间轴':boardZoom<55?'紧凑':'卡片';return;
    }
    if (!event.target.matches('[data-dock-search]')) return;
    boardQuery=event.target.value;paintBoard(true);
  });
}
function paintBoard(keepFocus=false){
  const host=document.querySelector('[data-dock-board-host]');
  if(!host)return;
  host.innerHTML=dockBatchBoard(snapshot?.batches?.items||[],{label,account,zoom:boardZoom,grain:boardGrain,query:boardQuery,selected:selectedBatch});
  if(keepFocus)host.querySelector('[data-dock-search]')?.focus();
}
export function dockManagementMounted() {
  const host=document.querySelector('[data-dock-management]');
  const current=host?.dataset.dockManagement || '';
  const entered=current!==active;
  active=current;
  if(entered){detailGeneration++;detailBusy=false;}
  if (!host) {detailGeneration++;detailBusy=false;detail=null;detailError='';return;}
  if (entered) {detail=null;detailError='';void load();}
  else paintDetail();
}
