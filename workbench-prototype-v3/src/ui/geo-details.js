function el(tag,text,cls){const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(cls)node.className=cls;return node;}
function value(v){return v===null||v===undefined||v===''?'未知':String(v);}
function time(v){return v&&Number.isFinite(Date.parse(v))?`${new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})} 北京时间`:'未取得';}
function count(v){return v&&v.passed!=null&&v.total!=null?`${v.passed} / ${v.total}`:'未知';}
function row(label,v){const item=el('div',null,'geo-row');item.append(el('dt',label),el('dd',value(v)));return item;}
function section(title,rows){const s=el('section',null,'geo-section');const list=el('dl');for(const [label,v] of rows)list.append(row(label,v));s.append(el('h3',title),list);return s;}
export function renderGeoDetails(host,card){
  host.classList.add('geo-details');
  const geo=card.geo||{}, task=geo.task||{}, batch=geo.batch||{}, outputs=geo.outputs;
  const intro=el('section',null,'geo-intro');intro.append(el('h2',card.fact||'自动撰稿概况'),el('p',card.summary||'运行信息待核对'));
  const taskSection=section('任务运行', [['调度状态',({Ready:'等待运行',Running:'运行中',Disabled:'已暂停',Queued:'排队中',Unknown:'未取得'})[task.state]||task.state],['最近启动',time(task.last)],['下次计划',time(task.next)],['最近结束码',task.result]]);
  const batchSection=section('最近批次', [['批次日期',batch.date],['回执时间',batch.receiptTime],['运行模式',batch.dryRun===true?'试运行':batch.dryRun===false?'非试运行':null],['与最近启动的关系',geo.currentReceipt===true?'回执时间不早于最近启动':geo.currentReceipt===false?'历史回执，不能代表本次运行':null]]);
  const checks=section('稿件校验', [['规则门禁通过 / 总数',count(geo.gates)],['输出文件非空 / 总数',outputs?count({passed:outputs.nonEmpty,total:outputs.total}):'未知']]);
  checks.append(el('p','规则通过和文件非空不代表已发布，也不代表已完成人工审校。','geo-note'));
  const evidence=el('details',null,'geo-evidence');evidence.append(el('summary','技术证据与读取范围'),el('p',card.source||'来源未知'),el('p',`读取时间：${value(card.observedAt)}；调度时间来自 Windows，回执时间来自本地记录，原始时间含时区时按原值展示。`),el('p',card.detail||'暂无技术证据。'));
  host.replaceChildren(intro,taskSection,batchSection,checks,evidence);
}
