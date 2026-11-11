const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function dockDashboard() {
  return `<section class="sales-observation"><div data-dock-facts><h2>正在读取对接表运行记录…</h2></div><section data-operations-reminders="bridge" aria-label="对接表运维提醒"><h2>需处理</h2><p>正在读取…</p></section></section>`;
}
export function dockFacts(data) {
  const batches=data.batches, mirror=data.receipts?.mirror;
  const pending=(batches?.items||[]).filter(b=>b.status==='pending');
  const expired=pending.filter(b=>b.expired).length;
  const areas=[
    ['机器人服务',data.service?.status==='Running'?'服务正在运行':data.service?.status==='Stopped'?'服务已停止':'服务状态待核对','服务进程状态；消息收发与表格访问需分别核对。'],
    ['批次进度',batches?.status==='available'?`${pending.length-expired} 批待确认 · ${expired} 批确认已过期`:'批次记录读取失败','取消、被替代和已结束批次不计入当前待确认；必填缺项在批次内核对。'],
    ['双表同步',mirror?.status==='available'?`${mirror.items.reduce((n,r)=>n+(r.phase==='ready'?r.count:0),0)} 条本地记录已完成同步 · ${mirror.items.reduce((n,r)=>n+(r.phase!=='ready'?r.count:0),0)} 条需核对`:'同步账本读取失败','这是保留账本的状态，不是本轮远端一致性验证；未知写入不得直接重试。'],
    ['账号与表',data.bindings?.status==='available'?`${data.bindings.items.filter(b=>b.state==='ready').length} 个绑定已就绪 · ${data.bindings.items.filter(b=>b.state!=='ready').length} 个需核对`:'账号绑定读取失败','本地绑定就绪不等于当前飞书访问权限有效。'],
  ];
  return `<p class="sub">读取于 ${esc(new Date(data.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))} 北京时间 · 本机只读观测</p><div class="sales-areas">${areas.map(([title,state,note])=>`<section class="sales-area"><h3>${title}</h3><p>${esc(state)}</p><details><summary>观测依据</summary><p>${note}</p></details></section>`).join('')}</div>`;
}
let snapshot,pending,lastRead=0;
export function dockDashboardMounted(){
  const hosts=()=>document.querySelectorAll('[data-dock-facts]');
  if(!hosts().length)return;
  const paint=()=>hosts().forEach(host=>host.innerHTML=dockFacts(snapshot));
  if(snapshot)paint();
  if(pending||Date.now()-lastRead<15000)return;
  pending=fetch('/api/dock-management?action=overview').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{snapshot=data;lastRead=Date.now();paint();}).catch(()=>hosts().forEach(host=>host.textContent='本次运行记录读取失败，请稍后重新打开。')).finally(()=>pending=null);
}
