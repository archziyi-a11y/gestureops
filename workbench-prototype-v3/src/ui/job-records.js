const states={running:'执行中',unknown:'结果未知',submit_outcome_unknown:'结果未知',pending:'结果待核对',knownsuccess:'已完成',knownfailure:'未完成',rejected:'未下发',failed:'未完成',accepted_not_verified:'已下发，安装待确认',returned:'已返回操作结果',partial:'部分完成',completed:'批次结束',dispatching:'下发中',preparing:'准备中',publishing:'发布中'};
const labels={save:'保存模型配置',reload:'重载模型配置',upload:'上传资料',review:'审核知识',publish:'发布知识',withdraw:'撤回知识',query:'回答调试',organize:'整理资料','business-save':'保存提示词','business-delete':'删除提示词版本','business-release':'实装提示词','business-compare':'对比提示词','prompt-save':'保存试问提示词','source-upload':'归档原件','source-update':'更新原件','source-prepare':'准备整理任务',delete:'删除物料',submit:'下发工作机更新'};
const areas={model:'模型连接',knowledge:'知识与提示词',materials:'团队物料',devices:'工作机'};
export async function jobRecordsMounted(){
  const host=document.querySelector('[data-job-records]');if(!host)return;
  try{
    const r=await fetch('/api/job-records');if(!r.ok)throw Error();const data=await r.json();
    if(!Array.isArray(data.records))throw Error();
    const receiptIds=new Set((data.deviceReceipts||[]).map(x=>x.requestId));
    const rows=[...data.records.filter(x=>!x.receiptId||!receiptIds.has(x.receiptId)).map(x=>({...x,title:labels[x.action]||'维护操作',source:areas[x.area]||'维护'})),
      ...(data.deviceReceipts||[]).map(x=>({id:x.requestId,at:x.createdAt,state:x.state,title:`${x.action==='install'?'安装':'更新'} ${x.appName||'销售助手'}`,source:`工作机回执 · ${x.deviceId?.slice(-6)||''}`})),
      ...(data.batches||[]).map(x=>({id:x.id||x.requestId,at:x.updatedAt||x.createdAt,state:x.state,title:'批量更新',source:'批次回执'}))].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    if(!host.isConnected)return;host.replaceChildren();
    if(data.persistenceError){const p=document.createElement('p');p.textContent='部分作业结果未能保存，请核对原工作面的回执，不要重复提交。';host.append(p);}
    if(!rows.length){host.append(Object.assign(document.createElement('p'),{textContent:'暂无已接入的维护作业记录。'}));return;}
    for(const row of rows){const section=document.createElement('section');section.className='sales-row';
      const title=document.createElement('strong');title.textContent=row.title;
      const info=document.createElement('p');info.textContent=`${states[row.state]||'状态待核对'} · ${row.source}${row.interrupted?' · 服务中断，需核对实际结果':''}`;
      const time=document.createElement('small');time.textContent=row.at?`${new Date(row.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} 北京时间`: '未记录时间';
      section.append(title,info,time);host.append(section);
    }
  }catch{if(host.isConnected)host.textContent='作业记录读取失败，请重新打开页面。';}
}
