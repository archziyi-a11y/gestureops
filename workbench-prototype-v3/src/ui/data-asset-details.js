const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count = n => Number.isSafeInteger(n) && n >= 0 ? String(n) : '未知';
const value = v => v ? escape(v) : '未知';

export function renderDataAssetDetails(host, card) {
  const d = card?.dataAsset || {};
  const image = card?.id === 'images';
  if (!image && card?.id !== 'sales-sources') return false;
  const rows = image ? [
    ['归档索引', `${count(d.total)} 条`], ['图片类型记录', `${count(d.images)} 条`],
    ['最近图片归档', `${value(d.latestImage)}（采集器时间，非入库时间）`],
    ['清单修改', `${value(d.manifestModifiedAt)}（本机文件系统 UTC）`],
    ['本地可读性', d.media ? `${count(d.media.readable)} / ${count(d.media.checked)}，不可读或为空 ${count(d.media.failed)}；${value(d.media.startedAt)} 至 ${value(d.media.finishedAt)}（本机探针时间）` : '未完成验证'],
    ['消费去向', '本地清单可供 Prism 处理；未验证入库或消费'],
  ] : [
    ['源文件', `${count(d.total)} 份`], ['待整理', `${count(d.pending)} 份`],
    ['最近记录更新', `${value(d.updatedAt)}（资料库事件时间）`],
    ['消费去向', '资料可关联知识草稿和发布记录；未验证实际业务消费'],
  ];
  host.innerHTML = `<section class="data-asset-details"><h2>${image?'教研图片集':'销售知识资料'}</h2><p>${card.status === 'unknown'?'当前观测未取得，数量和状态不能推断。':image?'清单记录不代表图片已入库或通道当前健康。':'归档不等于整理、发布或业务使用。'}</p><dl>${rows.map(([label,text])=>`<div><dt>${label}</dt><dd>${text}</dd></div>`).join('')}</dl><details><summary>来源与范围</summary><p>${image?'本地归档清单；可读性只检查非空，不解码图片。':'调用方提供的资料库快照；未主动读取原件或初始化资料库。'}</p><p>${value(card.source)}</p></details></section>`;
  return true;
}
