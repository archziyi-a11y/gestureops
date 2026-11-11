function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}

export function renderInfraDetails(host, card) {
  host.classList.add('infra-details');
  const sub = host.closest('.ws-detail')?.querySelector('.pagehead .sub');
  if (sub) sub.textContent = card.id === 'bots' ? '本机机器人服务观测' : '本机容器与就绪检查';
  const intro = el('section', null, 'infra-intro');
  intro.append(el('h2', card.fact), el('p', card.summary));
  const list = el('section', null, 'infra-list');
  list.append(el('h3', card.id === 'bots' ? '服务状态' : '容器状态'));
  for (const item of card.infra.items) {
    const row = el('details', null, 'infra-item');
    const summary = el('summary');
    summary.append(el('span', item.businessName, 'infra-name'), el('span', item.stateLabel, `infra-state infra-state-${item.state}`));
    const body = el('div', null, 'infra-item-body');
    body.append(el('p', '技术名称'), el('code', item.name), el('p', item.error || `原始状态：${item.raw}`));
    row.append(summary, body);
    list.append(row);
  }
  const children = [intro, list];
  if (card.infra.readiness) {
    const ready = card.infra.readiness;
    const section = el('section', null, 'infra-readiness');
    const label = ready.state === 'ready' ? '通过' : ready.state === 'not_ready' ? '未通过' : '读取失败';
    section.append(el('h3', '平台就绪检查'), el('p', label), el('p', ready.error || `HTTP ${ready.httpStatus}`));
    children.push(section);
  }
  const evidence = el('details', null, 'infra-evidence');
  evidence.append(el('summary', '读取依据与限制'), el('p', card.source), el('p', card.observedAt ? `读取于 ${new Date(card.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})} 北京时间` : '观测时间未取得'), el('p', '服务或容器运行、就绪检查通过均不证明业务任务完成；请以业务回执为准。'));
  children.push(evidence);
  host.replaceChildren(...children);
}
