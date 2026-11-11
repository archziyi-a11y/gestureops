function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;}
function section(title,rows){const s=el('section',null,'portrait-section'), dl=el('dl');for(const [name,value] of rows){const row=el('div');row.append(el('dt',name),el('dd',value ?? '未取得'));dl.append(row);}s.append(el('h3',title),dl);return s;}
function time(value){if(!value || Number.isNaN(Date.parse(value)))return '未取得';return `${new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}（北京时间）`;}
export function renderPortraitDetails(host,card){
  const p=card.portrait||{}, t=p.task||{}, f=p.file||{};
  host.classList.add('portrait-details');
  const intro=el('section',null,'portrait-intro');intro.append(el('h2',card.fact||'画像同步状态未取得'),el('p','本机副本与远端画像生成是不同环节。'));
  const task=section('计划任务',[['状态',({Ready:'等待运行',Running:'运行中',Disabled:'已暂停',Queued:'排队中',Unknown:'未取得'})[t.state]||t.state],['执行账号',t.account],['最近启动',time(t.last)],['下次计划',time(t.next)],['最近结果码',t.result]]);
  const file=section('本地副本',[['文件状态',({present:'存在',missing:'未找到',unavailable:'未取得'})[f.state]],['大小',f.size == null ? null : `${f.size} 字节`],['文件修改时间',time(f.mtime)],['关联程度',p.association==='configured-target'?'任务参数指定的目标，写入归属未验证':'未能确认任务目标']]);
  const evidence=el('details',null,'portrait-evidence');evidence.append(el('summary','证据与范围'),el('p',card.source||'来源未取得'),el('p',`目标路径：${p.output||'未取得'}`),el('p',`观测时间：${time(card.observedAt)}；任务时间来自本机计划任务，文件修改时间来自本机文件系统。`),el('p','任务正常退出和文件存在均不证明本次写入、画像生成时间、新鲜度或业务消费。未读取画像正文。'));
  host.replaceChildren(intro,task,file,evidence);
}
