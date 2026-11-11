function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

const scope = {
  sales: '销售业务的完整可用性尚未取得观测，不能仅凭单项依赖判断。',
  bridge: '回执仅覆盖本地保留的历史记录，不代表当前请求或远端表状态。',
  prism: '本地预览和采集结果不代表生产访问或教师使用已验收。',
};

export function renderApplicationDetails(host, card) {
  host.classList.add('application-details');
  const intro = element('section', null, 'application-intro');
  intro.append(element('h2', card.fact || '当前观测未取得'));
  if (card.summary && card.summary !== card.fact && !card.sections?.length) {
    intro.append(element('p', card.summary));
  }
  intro.append(element('p', scope[card.id] || '当前业务可用范围尚待核对。', 'application-scope'));

  const content = [intro];
  const alerts = Array.isArray(card.alerts) ? card.alerts.filter(x => typeof x === 'string' && x.trim()) : [];
  if (!alerts.length && card.issue) alerts.push(card.issue);
  if (alerts.length) {
    const section = element('section', null, 'application-alerts');
    section.append(element('h3', '当前影响与待核对'));
    const list = element('ul');
    for (const alert of alerts) list.append(element('li', alert));
    section.append(list);
    content.push(section);
  }
  for (const item of Array.isArray(card.sections) ? card.sections : []) {
    if (!item || typeof item.title !== 'string' || typeof item.text !== 'string') continue;
    const section = element('section', null, 'application-section');
    section.append(element('h3', item.title), element('p', item.text || '未取得'));
    content.push(section);
  }
  if (!card.sections?.length) {
    const section = element('section', null, 'application-section');
    section.append(element('h3', card.id === 'bridge' ? '业务回执' : '业务状态'),
      element('p', card.status === 'unknown' ? '本次观测不可用，当前状态待核对。' : '尚无更多结构化业务明细。'));
    content.push(section);
  }
  const evidence = element('details', null, 'application-evidence');
  evidence.append(element('summary', '来源与技术依据'),
    element('p', `来源：${card.source || '未取得'}`),
    element('p', `观测时间：${card.observedAt || '未取得'}（来源原始时间）`));
  if (card.detail) evidence.append(element('p', card.detail));
  content.push(evidence);
  host.replaceChildren(...content);
}
