const sources = {
  devices: '/api/work-devices',
  knowledge: '/api/knowledge',
  materials: '/api/team-materials',
};
const cache = new Map();
const stamp = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

export function summarizeSalesFact(kind, data) {
  if (kind === 'devices') {
    if (!Array.isArray(data.devices)) throw Error('invalid devices');
    const rows = data.devices;
    const online = rows.filter(d => d.online === true).length;
    const offline = rows.filter(d => d.online === false).length;
    const versions = new Map();
    for (const d of rows) {
      const version = d.workClientVersion || '版本未取得';
      versions.set(version, (versions.get(version) || 0) + 1);
    }
    const reports = new Map();
    for (const d of rows) {
      const states = d.apps === null ? ['安装回报读取失败'] : Array.isArray(d.apps) && d.apps.length ? [...new Set(d.apps.map(a => a.status || '安装状态未取得'))] : ['暂无安装记录'];
      for (const state of states) reports.set(state, (reports.get(state) || 0) + 1);
    }
    return {
      title: rows.length ? `${rows.length} 台工作机 · ${online} 台在线 · ${offline} 台离线${rows.length-online-offline ? ` · ${rows.length-online-offline} 台连接状态未取得` : ''}` : '暂无工作机',
      detail: rows.length ? `方舟后台：${[...versions].map(([v,n]) => `${v}（${n} 台）`).join('、')}。安装回报：${[...reports].map(([v,n]) => `${v} ${n} 台`).join('；')}。` : '',
      observedAt: data.observedAt,
    };
  }
  if (kind === 'knowledge') {
    if (!Array.isArray(data.documents) || data.version == null) throw Error('invalid knowledge');
    const active = data.documents.filter(d => d.state === 'active').length;
    return { title: `已发布 ${active} 份 · 本地知识版本 ${data.version}`, detail: `共 ${data.documents.length} 份资料，${data.documents.length-active} 份未处于发布状态。` };
  }
  if (!Array.isArray(data.materials)) throw Error('invalid materials');
  const images = data.materials.filter(m => m.type === 'IMAGE').length;
  return { title: `${data.materials.length} 项团队物料`, detail: `图片 ${images} 项 · 其他物料 ${data.materials.length-images} 项。` };
}

function paint(kind, entry) {
  const title = document.querySelector(`[data-sales-status="${kind}"]`);
  const detail = document.querySelector(`[data-sales-description="${kind}"]`);
  if (!title || !detail) return;
  title.textContent = entry.fact?.title || '本次查询失败';
  detail.textContent = entry.fact
    ? `${entry.fact.detail} ${entry.error ? '本次刷新失败，保留上次结果。' : ''}查询于 ${stamp(entry.fact.observedAt || entry.readAt)}（北京时间）`
    : '未取得清单，请稍后重开详情。其他项目的查询不受影响。';
}

export function salesLiveFactsMounted() {
  if (!document.querySelector('[data-sales-status="devices"]')) return;
  loadRuntime();
  for (const [kind, url] of Object.entries(sources)) {
    const entry = cache.get(kind) || {};
    cache.set(kind, entry);
    if (entry.fact || entry.error) paint(kind, entry);
    if (entry.pending || Date.now() - (entry.attemptAt || 0) < 60000) continue;
    entry.attemptAt = Date.now();
    entry.pending = (async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw Error('read failed');
        entry.fact = summarizeSalesFact(kind, await response.json());
        entry.readAt = Date.now();
        entry.error = false;
      } catch { entry.error = true; }
      finally { entry.pending = null; paint(kind, entry); }
    })();
  }
}

export function runtimeRows(data) {
  if (!Array.isArray(data.items) || data.items.length!==4 || !data.windowStart || !data.windowEnd) throw Error('invalid runtime');
  return data.items.map(item => {
    if (![item.active,item.succeeded,item.failed,item.cached].every(n=>Number.isSafeInteger(n)&&n>=0)) throw Error('invalid counts');
    return {
      title:item.kind==='profile'?'画像生成':item.kind,
      text: item.active+item.succeeded+item.failed+item.cached===0 ? '近期无请求' :
        `进行中 ${item.active} · 成功 ${item.succeeded} · 未完成 ${item.failed}${item.cached?` · 沿用已有画像 ${item.cached}`:''}`,
      detail:[item.lastSuccess?`最近成功 ${stamp(item.lastSuccess)}`:'',...(item.failures||[]).map(f=>`${f.reason}：${f.count} 次`)].filter(Boolean).join('；'),
    };
  });
}

let runtimePending;
function loadRuntime() {
  if (runtimePending) return;
  runtimePending=(async()=>{
    let host;
    try {
      const [response, cardsResponse]=await Promise.all([fetch('/api/sales-runtime',{signal:AbortSignal.timeout(40000)}),fetch('/api/card-observations',{signal:AbortSignal.timeout(60000)}).catch(()=>null)]);
      if (!response.ok) throw Error();
      const data=await response.json();
      const rows=runtimeRows(data);
      let sync;
      if(cardsResponse?.ok) sync=(await cardsResponse.json()).cards?.find(c=>c.id==='portraits');
      host=document.querySelector('[data-sales-runtime]');
      if(!host) return;
      host.replaceChildren();
      const note=document.createElement('p');
      note.textContent=`${stamp(data.windowStart)} 至 ${stamp(data.windowEnd)}（北京时间，服务端时钟）${data.coverageDegraded?' · 记录有缺口，不能据此判断无故障':''}`;
      host.append(note);
      const grid=document.createElement('div');grid.className='sales-areas';host.append(grid);
      for(const row of [...rows,{title:'画像同步',text:sync?.fact||'本次同步状态未取得',detail:sync?.detail||''}]) {
        const section=document.createElement('section');section.className='sales-area';
        const title=document.createElement('h4');title.textContent=row.title;
        const status=document.createElement('p');status.textContent=row.text;
        section.append(title,status);
        if(row.detail) {const detail=document.createElement('details');const summary=document.createElement('summary');summary.textContent='运行记录';const p=document.createElement('p');p.textContent=row.detail;detail.append(summary,p);section.append(detail);}
        grid.append(section);
      }
      const scope=document.createElement('details');
      const label=document.createElement('summary');label.textContent='统计口径';
      const body=document.createElement('p');body.textContent='成功与未完成按状态更新时间统计，进行中包含更早开始且未结束的任务。仅计已进入生成队列的回答；画像单独统计进入画像生成阶段的调用，缓存沿用不算新生成。请求在鉴权或入队前被拒、画像前置数据读取失败，不代表画像生成失败；本机同步与服务端画像生成不是同一环节。';
      scope.append(label,body);host.append(scope);
    } catch { host=document.querySelector('[data-sales-runtime]');if(host) host.textContent='本次生成运行记录读取失败，请稍后重新打开。'; }
    finally {runtimePending=null;}
  })();
}
