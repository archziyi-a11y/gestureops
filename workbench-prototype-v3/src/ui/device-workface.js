import { openDeviceBatch } from './device-batch.js';
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let inventory, loading = false, error = '', filter = '', modal = null, receipts = [];
let pageActive = false, viewServices;
async function refreshDevices() {
  if(loading)return;
  loading=true;error='';viewServices.redraw();
  try {receipts=await request('/api/work-devices/actions');inventory=await request('/api/work-devices');}
  catch(e){error=e.message;}
  finally {loading=false;viewServices.redraw();}
}
export function deviceWorkfaceMounted() {
  const active=location.hash==='#/p/sales/w/devices';
  const entered=active&&!pageActive;
  pageActive=active;
  if(entered&&viewServices)void refreshDevices();
}
const receiptText = r => ({accepted_not_verified:'已下发 · 安装版本待确认',submit_outcome_unknown:'下发结果未知 · 请核对，勿重复提交',pending:'正在下发',rejected:'未下发',failed:'未下发'}[r.state] || '结果待核对');
const receiptDetail = r => r.persistenceWarning ? '回执保存异常，请保留本次结果并核对记录。' : ({app_changed:'安装包登记已变更，请重新选择。',device_unavailable:'设备离线、已移除或状态不可用。',work_client_upgrade_required:'请先升级手机端方舟工作端，再更新销售助手。',read_failed:'提交前核对失败，未发送安装指令。',invalid_action:'操作类型无效。',upstream_rejected:'方舟拒绝了安装请求。',submit_outcome_unknown:'请核对手机和平台记录，不要重复下发。'}[r.message] || '');
async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || data.message || '操作失败');
  return data;
}
const stamp = v => v ? new Date(v).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}) : '未取得';
export function deviceWorkface() {
  const rows = (inventory?.devices || []).filter(r => `${r.label} ${r.model} ${r.id}`.toLowerCase().includes(filter.toLowerCase()));
  return `<section class="device-list"><div class="device-toolbar"><div><h2>工作机清单</h2><p class="sub">${inventory ? `共 ${inventory.devices.length} 台 · 方舟读取于 ${stamp(inventory.observedAt)} · 北京时间` : '方舟设备与应用安装记录'}</p></div><div><button class="btn" data-device="refresh" ${loading?'disabled':''}>${loading?'读取中…':'刷新'}</button> <button class="btn" data-device="batch">批量更新</button> <button class="btn btn--primary" data-device="add" aria-label="配置工作机">配置工作机</button></div></div>
  ${inventory?.authorization?.expiresEpoch?`<p class="device-authorization-notice">本期授权将于 <time>${new Date(inventory.authorization.expiresEpoch*1000).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric'})}</time> 失效，请及时进行授权机制更新。</p>`:''}
  <label class="device-search">查找工作机<input type="search" data-device-search value="${esc(filter)}" placeholder="名称、型号或设备编号"></label>
  ${error?`<p role="alert">${esc(error)}${inventory?'；下方保留上次读取结果。':''}</p>`:''}
  <div class="device-table-wrap"><table class="device-table"><thead><tr><th>工作机</th><th>连接</th><th>方舟工作端版本</th><th><span tabindex="0" title="方舟记录的安装结果，不代表手机当前实际版本。" aria-label="销售助手安装回报：方舟记录的安装结果，不代表手机当前实际版本。">销售助手安装回报</span></th><th>最近上报 · 北京时间</th><th>操作</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${esc(r.label)}</strong><small>${esc(r.model)} · ${esc(r.id.slice(-6))}</small></td><td>${r.online===true?'在线':r.online===false?'离线':'未知'}</td><td>${esc(r.workClientVersion || '未取得')}</td><td>${r.apps===null?'读取失败':r.apps.length?r.apps.map(a=>`${esc(a.name)}<small>${esc(a.status)}</small>`).join(''):'暂无安装记录'}</td><td>${stamp(r.lastReport)}</td><td><button class="btn" data-device="upgrade" data-id="${esc(r.id)}">更新</button></td></tr>`).join('')||`<tr><td colspan="6">${loading?'正在读取方舟工作机…':inventory?'没有匹配的工作机':'尚未读取清单，点击刷新。'}</td></tr>`}</tbody></table></div>
  ${receipts.length?`<section class="device-receipts"><h3>最近下发</h3>${receipts.slice(-10).reverse().map(r=>`<p><strong>${esc(inventory?.devices.find(d=>d.id===r.deviceId)?.label || r.deviceId.slice(-6))}</strong> · ${esc(r.appName || '销售助手')}<br><span>${esc(receiptText(r))}</span>${receiptDetail(r)?`<small>${esc(receiptDetail(r))}</small>`:''}<small>${stamp(r.createdAt)} · 北京时间</small></p>`).join('')}</section>`:''}</section>`;
}
async function openDialog(action, id, services) {
  if (!['add', 'upgrade'].includes(action)) return;
  modal?.remove();
  const row = inventory?.devices.find(r=>r.id===id);
  const dialog = document.createElement('dialog'); modal = dialog;
  dialog.className='device-dialog';
  if(action==='upgrade' && row?.upgradeBlock==='work_client_upgrade_required') {
    dialog.innerHTML=`<form method="dialog"><header><h2>请先升级手机端后台</h2><button aria-label="关闭" title="关闭">×</button></header><p>${esc(row.label)} · 方舟工作端 ${esc(row.workClientVersion)}</p><p>此版本无法自动安装更新。先在手机上升级方舟工作端，再返回更新销售助手。</p><footer><button>知道了</button></footer></form>`;
    document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();if(modal===dialog)modal=null;},{once:true});dialog.showModal();return;
  }
  const title = {add:'配置工作机',upgrade:'更新销售助手'}[action];
  dialog.innerHTML=`<form method="dialog"><header><h2>${title}</h2><button aria-label="关闭" title="关闭" formnovalidate>×</button></header>${action==='add'?`<label>选择方舟已有工作机<select name="device" required><option value="">请选择</option>${(inventory?.devices||[]).map(r=>`<option value="${esc(r.id)}" ${r.online!==true?'disabled':''}>${esc(r.label)} · ${esc(r.id.slice(-6))}${r.online!==true?' · 离线或状态未知':''}</option>`).join('')}</select></label>`:`<p><strong>${esc(row?.label)}</strong> · ${esc(row?.id.slice(-6))}</p>`}<label>销售助手版本<select name="app" required disabled><option value="">正在读取已登记安装包…</option></select></label><p>${action==='add'?'先安装销售助手，再由管理员在手机内导入团队配置。已有配置无需重新导入。':'覆盖安装，保留手机现有资料和团队配置。'}</p><p role="status" data-result></p><footer><button value="cancel" formnovalidate>关闭</button><button type="button" data-submit disabled>${action==='add'?'下发安装':'确认更新'}</button></footer></form>`;
  document.body.append(dialog); dialog.addEventListener('close',()=>{dialog.remove();if(modal===dialog)modal=null;},{once:true});
  dialog.showModal();
  const result=dialog.querySelector('[data-result]'), submit=dialog.querySelector('[data-submit]'), appSelect=dialog.querySelector('[name=app]');
  let apps=[], submitting=false, requestId=crypto.randomUUID();
  const update=()=>{submit.disabled=submitting || !appSelect.value || !(action==='add'?dialog.querySelector('[name=device]').value:row?.online===true);};
  dialog.addEventListener('change',update);
  try {
    const catalog=await request('/api/work-devices/apps'); apps=catalog.apps;
    appSelect.innerHTML='<option value="">请选择版本</option>'+apps.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
    appSelect.disabled=false;
    if(apps.length===1)appSelect.value=String(apps[0].id);
    if(!apps.length)result.textContent='方舟尚未登记销售助手安装包。';
    update();
  } catch(e){result.textContent=e.message;}
  submit.addEventListener('click',async()=>{
    if(submitting || !dialog.querySelector('form').reportValidity())return;
    const app=apps.find(a=>String(a.id)===appSelect.value); if(!app)return;
    const deviceId=action==='add'?dialog.querySelector('[name=device]').value:id;
    submitting=true;update();appSelect.disabled=true;
    const deviceSelect=dialog.querySelector('[name=device]');if(deviceSelect)deviceSelect.disabled=true;
    result.textContent='正在提交…';
    try {
      const receipt=await request('/api/work-devices/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,deviceId,appId:app.id,appFingerprint:app.fingerprint,action:action==='add'?'install':'upgrade'})});
      result.textContent=receiptText(receipt)+(receiptDetail(receipt)?'。'+receiptDetail(receipt):'')+(action==='add'&&receipt.state==='accepted_not_verified'?'。新机安装后仍待导入团队配置。':'');
      receipts=[...receipts.filter(r=>r.requestId!==receipt.requestId),receipt];
      services.redraw();
    } catch(e){result.textContent=`${e.message}。请刷新下发记录核对结果。`;}
    // Keep this submission locked; a lost browser response must not cause a second install.
  });
}
export function initDeviceWorkface(services) {
  viewServices=services;
  document.addEventListener('click',async e=>{
    const button=e.target.closest('[data-device]'); if(!button)return;
    if(button.dataset.device==='batch'){openDeviceBatch();return;}
    if(button.dataset.device!=='refresh'){openDialog(button.dataset.device,button.dataset.id,services);return;}
    await refreshDevices();
  });
  document.addEventListener('input',e=>{if(!e.target.matches('[data-device-search]'))return;filter=e.target.value;services.redraw();document.querySelector('[data-device-search]')?.focus();});
}
