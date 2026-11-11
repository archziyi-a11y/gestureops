const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const definitions=[['sales','销售业务','画像生成 · 帮我回 · 润色 · 销售指导 · 语义检索'],['knowledge','知识与回答调试','资料整理 · 知识检索 · 试问与回答对比']];
const states={sales:{},knowledge:{}};
let services,active=false,monitor=null,monitorMessage='',monitorBusy=false;
const date=value=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
function balanceView(id) {
  const row=monitor?.connections[id], live=states[id].balance;
  const balance=row?.balances?row:live;
  const current=states[id].config?.saved.revision;
  if(balance?.revision&&current&&balance.revision!==current)return '<div class="model-balance">配置已变更，等待余额检查</div>';
  return `<div class="model-balance ${row?.status==='low'?'balance-low':''}">${balance?.balances?.length?balance.balances.map(b=>`${esc(b.currency)} ${esc(b.total)}`).join(' / '):'账户余额未查询'}${row?.status==='low'?'<span class="balance-warning">⚠ 余额偏低</span>':''}${balance?.checkedAt?`<small>${date(balance.checkedAt)} 北京时间</small>`:''}${row?.error?'<small>更新失败 · 保留上次查询结果</small>':''}</div>`;
}
function monitorView() {
  if(!monitor)return '';
  return `<details class="balance-settings"><summary>余额检查 · 每 ${monitor.intervalMinutes} 分钟 · 低于 ¥${monitor.threshold} 提醒</summary><form data-balance-settings><label>检查间隔（分钟）<input name="intervalMinutes" type="number" min="5" max="1440" step="1" required value="${monitor.intervalMinutes}"></label><label>提醒阈值（元）<input name="threshold" type="number" min="0" max="100000" step="0.01" required value="${monitor.threshold}"></label><button class="btn" ${monitorBusy?'disabled':''}>保存设置</button></form><p class="sub">工作台服务运行期间自动检查；关闭页面不影响检查。</p><p role="status">${esc(monitorMessage)}</p></details>`;
}
async function loadMonitor(){
  try{const r=await fetch('/api/balance-monitor');if(!r.ok)throw Error();monitor=await r.json();if(active)services.redraw();}catch{/* Keep the last observation during temporary network failures. */}
}
export function initModelConnections(value){services=value;}
export function modelConnectionsView(){
  return `<section class="model-connections"><header class="pagehead"><h2>模型连接</h2></header>${definitions.map(([id,title,usage])=>{
    const s=states[id], config=s.config, saved=config?.saved, pending=config&&config.active.revision!==saved.revision;
    return `<section class="model-connection" data-model-id="${id}"><div><h3>${title}</h3><p class="sub">${usage}</p>${saved?`<p>${esc(saved.model)} <span class="sub">· ${esc(saved.endpoint)}</span></p><p>${saved.configured?'Key 已配置':'尚未配置 Key'} · ${pending?'已保存，待重载':id==='sales'?'配置已载入':'后续请求读取此配置'}</p>`:'<p class="sub">尚未取得连接配置</p>'}</div><div class="model-controls">${balanceView(id)}<div class="actions"><button class="btn" data-model-action="read" ${s.busy?'disabled':''}>读取配置</button><button class="btn" data-model-action="test" ${!saved||s.busy?'disabled':''}>测试连接</button><button class="btn" data-model-action="balance" ${!saved||s.busy?'disabled':''}>查询余额</button>${id==='sales'?`<button class="btn" data-model-action="reload" ${!saved||s.busy?'disabled':''}>快速重载</button>`:''}</div></div><details><summary>更换 Key</summary><form data-model-key="${id}"><label>新 API Key<input type="password" name="key" autocomplete="new-password" required minlength="8" maxlength="4096" ${!saved||s.busy?'disabled':''}></label><button class="btn" ${!saved||s.busy?'disabled':''}>${id==='sales'?'保存 Key':'保存并应用'}</button></form></details><p role="status" class="sub">${esc(s.busy?'正在'+s.busy:s.message||'')}</p></section>`;
  }).join('')}${monitorView()}</section>`;
}
async function request(id,action,key){
  const s=states[id]; if(s.busy)return;
  s.busy=({read:'读取配置',save:'保存',test:'检查连接',reload:'重载配置',balance:'查询余额'})[action]; s.message=''; services.redraw();
  try{
    const response=await fetch('/api/model-connections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({target:id,action,key,revision:s.config?.saved.revision})});
    const result=await response.json(); if(!response.ok||result.error)throw Error(result.error||'操作未完成');
    if(result.saved){if(s.config?.saved.revision!==result.saved.revision)s.balance=null;s.config=result;}
    if(action==='balance')s.balance=result;
    s.message=action==='test'?result.message+(result.modelListed?'；当前模型在可用清单中':'；未在清单中找到当前模型'):action==='reload'?'重载完成，后续生成使用已保存配置':action==='save'?(id==='sales'?'已保存，请快速重载使其生效':'已保存，下一次调试采用新 Key'):action==='read'?'配置已读取':'余额已更新';
  }catch(error){s.message=error.message;}finally{s.busy=false;await loadMonitor();services.redraw();}
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-model-action]');if(button)void request(button.closest('[data-model-id]').dataset.modelId,button.dataset.modelAction);
});
document.addEventListener('submit',event=>{
  if(event.target.matches('[data-balance-settings]')) {
    event.preventDefault();if(monitorBusy)return;
    const values=new FormData(event.target);monitorBusy=true;monitorMessage='正在保存';services.redraw();
    void (async()=>{try{const r=await fetch('/api/balance-monitor',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intervalMinutes:Number(values.get('intervalMinutes')),threshold:Number(values.get('threshold'))})});const data=await r.json();if(!r.ok)throw Error(data.error);monitor=data;monitorMessage='已保存';}catch(e){monitorMessage=e.message;}finally{monitorBusy=false;services.redraw();}})();return;
  }
  const form=event.target.closest('[data-model-key]');if(!form)return;
  event.preventDefault();const key=new FormData(form).get('key');form.reset();void request(form.dataset.modelKey,'save',key);
});
export function modelConnectionsMounted(){
  const now=location.hash==='#/p/sales/w/runtime',entered=now&&!active;active=now;
  if(entered&&services){void loadMonitor();for(const [id] of definitions)void request(id,'read');}
}
setInterval(()=>{if(active&&!monitorBusy&&!Object.values(states).some(s=>s.busy)&&!document.activeElement?.matches('input,textarea'))void loadMonitor();},60000);
