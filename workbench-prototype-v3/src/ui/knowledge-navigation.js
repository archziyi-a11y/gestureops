export function knowledgeNavigation(active) {
 const entries=[['资料','knowledge','知识资料'],['调试','answer-lab','回答调试'],['物料','materials','团队物料']];
 return `<nav class="sales-tabs" aria-label="知识与物料">${entries.map(([id,route,label])=>`<a href="#/p/sales/w/${route}" ${id===active?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
}
export function documentNavigation(active) {
 return `<nav class="document-navigation" aria-label="资料状态"><a href="#/p/sales/w/knowledge" ${active==='originals'?'aria-current="page"':''}>原件</a><a href="#/p/sales/w/knowledge-edit" ${active==='documents'?'aria-current="page"':''}>知识草稿与发布</a></nav>`;
}
