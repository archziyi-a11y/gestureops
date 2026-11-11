const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = value => new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});

export function paintReminders(snapshot) {
  for (const host of document.querySelectorAll('[data-operations-reminders]')) {
    const project=host.dataset.operationsReminders || 'sales';
    const scoped={...snapshot,issues:snapshot.issues.filter(issue=>(issue.project||'sales')===project)};
    render(host,scoped);
  }
}
function render(host,snapshot) {
    const signature = JSON.stringify([snapshot.issues,snapshot.persistenceError]);
    if(host.dataset.signature === signature) return;
    const expanded = new Set([...host.querySelectorAll('details[open]')].map(n=>n.dataset.evidence));
    host.dataset.signature = signature;
    host.innerHTML = `<header class="ops-heading"><h2>需处理${snapshot.issues.length ? ` · ${snapshot.issues.length}` : ''}</h2><span>观测时间均为北京时间</span></header>
      ${snapshot.persistenceError ? '<p role="alert">提醒记录保存失败，本次业务结果不受此提示改写。</p>' : ''}
      ${snapshot.issues.length ? snapshot.issues.map(issue => `<article class="ops-issue" data-asset="${escape(issue.id)}" draggable="true" tabindex="0" aria-label="${escape(issue.title)}" aria-description="拖到右侧组装处理上下文，或按 Alt 加右箭头">
        <div class="ops-issue-main"><h3><span class="ops-symbol ${issue.severity === 'severe' ? 'is-severe' : issue.status==='unknown'?'is-unknown':''}" aria-hidden="true">${issue.status==='unknown'?'?':'!'}</span>${escape(issue.title)}</h3><p>${escape(issue.impact)}</p><p class="ops-next">${escape(issue.next)}</p>
        <details data-evidence="${escape(issue.id)}" ${expanded.has(issue.id)?'open':''}><summary>观测与依据</summary><dl><dt>首次观测</dt><dd>${time(issue.firstSeen)}</dd><dt>最近观测</dt><dd>${time(issue.lastSeen)}</dd><dt>来源</dt><dd>${escape(issue.source)}</dd><dt>回执</dt><dd>${escape(issue.evidence)}</dd></dl></details></div>
        <div class="ops-issue-action">${issue.handling === 'agent' ? `<span>拖到右侧，交给智能体</span><button data-ws="add-task" data-id="${escape(issue.id)}" class="ops-touch-add">加入本次处理</button>` : `<a href="${escape(issue.href)}">${issue.href.includes('devices')?'核对工作机':issue.href.includes('runtime')?'检查模型连接':'打开工作面'} →</a>`}</div></article>`).join('') : '<p class="ops-empty">已接入的观测暂无待处理提醒。</p>'}
      <details class="ops-coverage"><summary>监测覆盖</summary><dl>${snapshot.coverage.map(([name,state])=>`<dt>${escape(name)}</dt><dd>${escape(state)}</dd>`).join('')}</dl></details>`;
    host.querySelectorAll('.ops-issue').forEach(node=>{
      const issue=snapshot.issues.find(item=>item.id===node.dataset.asset);
      const link=node.querySelector('.ops-issue-action a');
      if(link && issue?.actionLabel)link.textContent=issue.actionLabel+' →';
    });
}
