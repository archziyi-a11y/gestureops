const states={Unknown:'未知',Disabled:'已暂停',Queued:'排队中',Ready:'等待下次采集',Running:'正在采集'};
const results={success:'完成',partial:'部分完成',failed:'失败'};
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
function time(v){return v ? `${new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})} 北京时间` : '未知';}
function value(v){return v == null ? '未知' : String(v);}
function section(title,lines){const s=el('section');s.append(el('h3',title));for(const line of lines)s.append(el('p',line));return s;}
export function renderJyqDetails(host,card){
  host.classList.add('jyq-details');
  const {task,receipt:r,frequency}=card.jyq;
  const sub=host.closest('.ws-detail')?.querySelector('.pagehead .sub');if(sub)sub.textContent='微信群图片与笔记采集到本地';
  const schedule=section('定时任务',task?[`状态：${states[task.state]} · ${frequency}`,`上次启动：${time(task.lastRunTime)} · 返回码 ${task.lastTaskResult}`,`下次计划：${time(task.nextRunTime)}`]:['调度器观测不可用']);
  const verdict=r?`${r.scope==='room'?'最近单群补采':r.scope==='all-whitelist'?'最近全群采集':'最近采集'}${results[r.status]}`:'暂未取得采集结果';
  const blocks=[el('h2',verdict)];
  if(card.issue)blocks.push(el('p',card.issue,'prism-warning'));
  if(card.jyq.channel)blocks.push(section('查询通道',[card.jyq.channel.label,`检查时间：${time(card.jyq.channel.observedAt)}`]));
  if(r?.scope==='room')blocks.push(el('p','单群结果与定时全群任务分开记录。'));
  if(r?.status==='success'&&r.assetsNew===0&&r.assetsFilled===0)blocks.push(el('p','本次未新增或补齐资产。'));
  blocks.push(schedule);
  if(r){
    const scope=r.scope==='room'?'单群补采':r.scope==='all-whitelist'?'白名单全群采集':'范围未标注的采集';
    const scopeText=r.scope==='room'?` · ${r.rooms.join('、') || '群未标注'} · 覆盖 ${value(r.scopeRooms)}/${value(r.whitelistRooms)} 群`:'';
    blocks.push(section('最近采集回执',[`${scope}：${results[r.status]}${scopeText}`,`完成时间：${time(r.finishedAt)}`,`扫描：${r.scanComplete===null?'未知':r.scanComplete?'完成':'未完成'} · 未完成项：${value(r.failedItems)}`]));
    blocks.push(section('实际范围与窗口',[r.window?`${time(r.window[0])} 至 ${time(r.window[1])}`:'读取窗口未知',r.windowFromPending===true?'窗口因待补项前推':r.windowFromPending===false?'窗口未因待补项前推':'窗口前推情况未知']));
    blocks.push(section('资产与待补',[`新增 ${value(r.assetsNew)} · 补齐 ${value(r.assetsFilled)} · 已完成跳过 ${value(r.assetsSkipped)}`,`本次范围待补 ${value(r.pendingInScope)} · 范围外待补 ${value(r.pendingOutOfScope)}`]));
    blocks.push(section('失败环节',[`网络 ${value(r.stages.network)} · 写入 ${value(r.stages.write)} · 解析 ${value(r.stages.parse)}`]));
  }else blocks.push(section('最近采集回执',['暂无有效回执']));
  const evidence=el('details',null,'jyq-evidence');evidence.append(el('summary','来源与依据'),el('p','定时任务来自本机 Windows 任务计划程序；采集结果来自 _meta/last_result.json，回执仅代表其标注的范围。'),el('p',`工作台读取时间：${time(card.observedAt)}`));
  blocks.push(evidence);host.replaceChildren(...blocks);
}
