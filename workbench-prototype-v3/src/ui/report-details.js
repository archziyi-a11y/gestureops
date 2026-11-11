const names = {'pddr-schedule-morning':'早间日报','pddr-schedule-evening':'晚间日报','pxkb-schedule-morning-brief':'早间工作简报','pxkb-schedule-deadline-alert':'截止日期提醒','pxkb-schedule-report-prompt':'日报录入提醒','pxkb-schedule-report-remind':'未填日报提醒','pxkb-schedule-merge':'日报汇总入表','pxkb-schedule-push-dashboard':'主管看板推送','pxkb-evening-chain':'晚间外部任务链','pxkb-morning-deadline':'早间截止任务链','pxkb-week-archive-manual':'手动周归档','pxkb-week-cutover-schedule':'周次切换'};
const actions={quota:'先处理飞书取数额度，再核对日报生成。',recipient:'核对员工收件标识与应用可用范围。',dashboard:'核对并补齐主管看板地址。',response_format:'交给智能体定位解析位置与运行版本。'};
const statuses={success:'执行成功',error:'执行失败',crashed:'执行中断',canceled:'已取消',running:'运行中',waiting:'等待中'};
function el(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
function time(value){if(!value)return '暂无执行';const iso=/(Z|[+-]\d{2}:\d{2})$/.test(value)?value:value.replace(' ','T')+'Z';return new Date(iso).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});}
function schedule(t){if(t.trigger==='webhook')return '外部 / 手动触发';if(!t.schedule.length)return '触发方式待核对';return t.schedule.map(s=>{const m=/^(\d+) (\d+) \* \* \*$/.exec(s);return m?`每天 ${m[2].padStart(2,'0')}:${m[1].padStart(2,'0')}`:s;}).join('、')+` · ${t.timezone==='Asia/Shanghai'?'北京时间':t.timezone}`;}
export function renderReportDetails(host,card){
  host.classList.add('report-details');
  const sub=host.closest('.ws-detail')?.querySelector('.pagehead .sub');if(sub)sub.textContent='日报生成、员工提醒与主管汇总';
  const {tasks,counts,window}=card.report;
  const failed=tasks.filter(t=>t.active&&['error','crashed','canceled'].includes(t.status));
  const intro=el('section',null,'report-intro');intro.append(el('h2',failed.length?`${failed.length} 项任务最近执行未完成`:'当前任务执行概况'),el('p',`最近读取 ${time(card.observedAt)} · 北京时间`));
  const groups=el('div',null,'report-issues');
  for(const reason of [...new Set(failed.map(t=>t.reason||'other'))]){
    const affected=failed.filter(t=>(t.reason||'other')===reason);const item=el('section');
    item.append(el('h3',affected[0].reasonLabel||'执行失败，需排查'),el('p',affected.map(t=>names[t.workflow]||t.workflow).join('、')),el('p',actions[reason]||'核对原执行回执与失败环节。','report-next'));groups.append(item);
  }
  const list=el('section',null,'report-tasks');list.append(el('h3','任务与运行时间'));
  for(const t of [...tasks].sort((a,b)=>Number(b.active)-Number(a.active))){
    const row=el('details',null,'report-task');const head=el('summary');
    head.append(el('span',names[t.workflow]||t.workflow,'report-name'),el('span',schedule(t),'report-schedule'),el('span',!t.active?'未启用':statuses[t.status]||'暂无执行',t.active&&['error','crashed','canceled'].includes(t.status)?'report-failed':'report-status'));row.append(head);
    const body=el('div',null,'report-task-body');body.append(el('p',`最近结果时间：${time(t.time)}${t.time?' · 北京时间':''}`));if(t.reasonLabel)body.append(el('p',t.reasonLabel));body.append(el('code',t.workflow));if(t.trigger==='webhook'&&!t.status)body.append(el('p','等待外部触发，暂无执行记录。'));row.append(body);list.append(row);
  }
  const evidence=el('details',null,'report-evidence');evidence.append(el('summary','统计范围与读取依据'),el('p',`近 7 天保留记录：${counts.total} 次 · 成功 ${counts.success} · 失败/取消 ${counts.failed} · 其他 ${counts.other}`),el('p',window),el('p',card.source),el('p','仅统计相关工作流的保留记录；执行成功不等于内容正确或消息已送达。'));
  host.replaceChildren(intro,groups,list,evidence);
}
