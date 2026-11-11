const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=86400000;
const dateKey=d=>d.toISOString().slice(0,10);
function bucket(value,grain){
  const d=new Date(value);
  d.setUTCHours(0,0,0,0);
  if(grain==='week')d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  if(grain==='month')d.setUTCDate(1);
  return d;
}
export function batchTimeline(items,requested='day'){
  const dated=items.filter(b=>b.created!=null&&Number.isFinite(Number(b.created))&&Number.isFinite(new Date(Number(b.created)*1000).getTime()));
  const unknown=items.filter(b=>!dated.includes(b));
  if(!dated.length)return {grain:requested,columns:unknown.length?[{key:'unknown',label:'日期未记录',items:unknown}]:[]};
  const stamps=dated.map(b=>Number(b.created)*1000+8*3600000);
  const grain=(Math.max(...stamps)-Math.min(...stamps))/day>366?'month':requested;
  const groups=new Map();
  for(const b of dated){const key=dateKey(bucket(Number(b.created)*1000+8*3600000,grain));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(b);}
  const columns=[];
  for(let d=bucket(Math.min(...stamps),grain),end=bucket(Math.max(...stamps),grain);d<=end;){
    const key=dateKey(d);
    columns.push({key,label:grain==='month'?key.slice(0,7):key,items:(groups.get(key)||[]).sort((a,b)=>a.created-b.created)});
    if(grain==='month')d.setUTCMonth(d.getUTCMonth()+1);else d=new Date(d.getTime()+(grain==='week'?7:1)*day);
  }
  if(unknown.length)columns.push({key:'unknown',label:'日期未记录',items:unknown});
  return {grain,columns};
}
export function dockBatchBoard(items,{label,account,zoom=75,grain='day',query='',selected=''}={}){
  const matched=items.filter(b=>(b.id+' '+account(b)).toLowerCase().includes(query.toLowerCase()));
  const timeline=batchTimeline(matched,grain);
  return `<section class="dock-date-board" data-dock-board data-density="${zoom<25?'timeline':zoom<55?'compact':'cards'}" style="--batch-column:${160+zoom*1.8}px"><div class="dock-board-tools"><label class="management-search">查找批次<input type="search" data-dock-search value="${esc(query)}" placeholder="批次编号或账号" autocomplete="off"></label><div class="dock-date-scale" role="group" aria-label="日期刻度">${[['day','日'],['week','周'],['month','月']].map(([v,t])=>`<button data-dock-grain="${v}" aria-pressed="${timeline.grain===v}">${t}</button>`).join('')}</div><label class="dock-board-zoom">缩放<input type="range" min="0" max="100" step="5" value="${zoom}" data-dock-zoom aria-label="时间轴缩放"><output data-dock-zoom-label>${zoom<25?'时间轴':zoom<55?'紧凑':'卡片'}</output></label></div><p class="dock-board-caption sub">${matched.length} 个批次 · 创建日期（北京时间）${timeline.grain==='week'?' · 每列一周':timeline.grain==='month'?' · 每列一月':''}</p><div class="dock-board-scroll" tabindex="0" aria-label="批次日期看板"><div class="dock-board-track">${timeline.columns.map(col=>`<section class="dock-date-column"><header><time>${esc(col.label)}</time><span>${col.items.length}</span></header><div class="dock-date-cards">${col.items.length?col.items.map(b=>`<article class="dock-batch-card" data-batch-card="${esc(b.id)}" data-selected="${b.id===selected}"><button class="dock-card-title" data-dock-live="batch" data-id="${esc(b.id)}"><strong>${esc(b.id)}</strong><span>${esc(account(b))}</span></button><p class="dock-card-state">${esc(label(b.status))}${b.expired?' · 已过期':''}</p><div class="dock-card-facts">${Object.entries(b.counts||{}).map(([k,v])=>`<span>${esc(label(k==='failed'?'failed_or_unknown':k))} <b>${esc(v)}</b></span>`).join('')||'<span>尚无逐项处理结果</span>'}</div><footer><time>${esc(new Date(b.created*1000).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}))}</time><button class="dock-card-followup" data-dock-live="followup" data-id="${esc(b.id)}">追问待补项</button></footer></article>`).join(''):'<span class="dock-date-empty">—</span>'}</div></section>`).join('')}</div></div><p data-dock-filter-empty ${matched.length?'hidden':''} role="status">没有匹配的批次。</p></section>`;
}
