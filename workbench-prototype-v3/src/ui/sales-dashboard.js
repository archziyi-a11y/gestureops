const areas = [
  ['devices', '工作机', '连接与更新', '正在读取工作机…', '', '在线状态、后台版本和安装回报来自方舟；安装回报不等于手机当前实际版本。'],
  ['knowledge', '知识库', '已发布与待整理', '正在读取知识库…', '', '本工作台知识库的发布状态与版本，不代表员工端已注入知识。'],
  ['materials', '团队物料', '当前共享资料', '正在读取物料…', '', '来自销售助手服务端物料清单。清单可读不代表所有工作机均已成功读取。'],
];

export function salesDashboard() {
  return `<section class="sales-observation">
    <div class="sales-status"><div><p class="eyebrow">现在怎么样</p><h2 data-sales-headline>正在读取最近状态…</h2><p data-sales-impact>正在核对已收到的余额与操作记录。</p></div></div>
    <section data-operations-reminders aria-label="运维提醒"><h2>需要处理</h2><p>正在读取…</p></section>
    <section class="sales-summary"><h3>模型费用</h3><p data-sales-balance>正在读取余额…</p><p data-sales-balance-time class="sub"></p></section>
    <section class="sales-summary"><h3>回答与画像</h3><div data-sales-runtime aria-live="polite">正在读取运行记录…</div></section>
    <div class="sales-areas">${areas.map(([id,title,question,status,description,evidence])=>`<section class="sales-area"><p class="eyebrow">${question}</p><h3>${title}</h3><p data-sales-status="${id}">${status}</p><p data-sales-description="${id}">${description}</p><details><summary>依据</summary><p>${evidence}</p></details></section>`).join('')}</div>
    <section class="sales-summary"><h3>最近变化</h3><div data-sales-changes>正在读取…</div></section>
    <details class="watch-details"><summary>历史项目记录</summary><p>2026-11-04：已进入多工作机使用与效果迭代；当时知识实际注入与工作机版本覆盖仍待核验。这不是当前运行状态。</p></details>
  </section>`;
}

export function paintSalesStatus(snapshot) {
  const issues=snapshot.issues || [];
  const set=(selector,text)=>document.querySelectorAll(selector).forEach(node=>node.textContent=text);
  set('[data-sales-headline]',issues.length ? `${issues.length} 项需要处理` : '暂未发现新的操作故障');
  set('[data-sales-impact]',issues.length ? issues[0].impact : '当前没有待处理的维护故障。工作机连接、资料与余额分别列在下方。');
  for(const host of document.querySelectorAll('[data-sales-changes]')) {
    host.replaceChildren();
    const recent=[...issues,...(snapshot.history||[])].sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen)).slice(0,5);
    if(!recent.length) { host.textContent='还没有记录到状态变化。'; continue; }
    for(const issue of recent) {
      const row=document.createElement('p');
      row.textContent=`${new Date(issue.lastSeen).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} · ${issue.status==='resolved'?'已恢复：':issue.status==='unknown'?'结果待核对：':'发现问题：'}${issue.title.replace(/结果待核对$|失败$/,'')}`;
      host.append(row);
    }
    const note=document.createElement('small');note.textContent='北京时间 · 工作台收到回执的时间';host.append(note);
  }
}
