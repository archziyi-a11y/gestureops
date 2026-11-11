import { mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const tracked = new Set(['save','reload','upload','review','publish','withdraw','query','organize','business-save','business-delete','business-release','business-compare','prompt-save','source-upload','source-update','source-prepare','delete','submit']);
export const recordLabels = {save:'保存模型配置',reload:'重载模型配置',upload:'上传资料',review:'审核知识',publish:'发布知识',withdraw:'撤回知识',query:'回答调试',organize:'整理资料','business-save':'保存提示词','business-delete':'删除提示词版本','business-release':'实装提示词','business-compare':'对比提示词','prompt-save':'保存试问提示词','source-upload':'归档原件','source-update':'更新原件','source-prepare':'准备整理任务',delete:'删除物料',submit:'下发工作机更新'};
export const recordStates = {running:'执行中',unknown:'结果未知',knownsuccess:'已完成',knownfailure:'未完成',accepted_not_verified:'已下发，安装待确认',returned:'已返回操作结果',partial:'部分完成'};
tracked.add('dock-save');
tracked.add('dock-restart');
tracked.add('dock-card-send');
recordLabels['dock-card-send']='发送批次待补卡片';
recordLabels['dock-save']='保存对接表运行配置';
recordLabels['dock-restart']='重启对接表 Bot';

export function createJobRecords({dir}) {
  mkdirSync(dir,{recursive:true});
  const file=join(dir,'job-records.jsonl');
  const events=[];
  try { for(const line of readFileSync(file,'utf8').split('\n').filter(Boolean)) events.push(JSON.parse(line)); }
  catch(e) { if(e.code!=='ENOENT')throw e; }
  let persistenceError=false;
  const append=event=>{appendFileSync(file,JSON.stringify(event)+'\n',{mode:0o600});events.push(event);};
  const latest=()=>{const rows=new Map();for(const e of events)rows.set(e.id,{...rows.get(e.id),...e});return rows;};
  // Interrupted submissions are not safe to replay automatically.
  for(const row of latest().values())if(row.state==='running')append({...row,state:'unknown',at:new Date().toISOString(),interrupted:true});
  return {
    snapshot(){return {records:[...latest().values()].sort((a,b)=>b.at.localeCompare(a.at)),persistenceError};},
    async run(meta,execute){
      if(!tracked.has(meta.action))return execute();
      const base={id:randomUUID(),area:meta.area,action:meta.action,at:new Date().toISOString(),state:'running'};
      // Record before dispatch; never persist credentials, payloads or customer text.
      append(base);
      let result;
      try {result=await execute();}
      catch(error){try{append({...base,at:new Date().toISOString(),state:'unknown'});}catch{persistenceError=true;}throw error;}
      const raw=result?.status||result?.state;
      let state=meta.action==='dock-card-send'&&raw==='accepted'?'returned':meta.action==='dock-card-send'&&result?.ok===false&&raw!=='unknown'?'knownfailure':['knownsuccess','knownfailure','accepted_not_verified','partial'].includes(raw)?raw:
        ['unknown','pending','submit_outcome_unknown','running','preparing','dispatching'].includes(raw)?'unknown':
        ['rejected','failed'].includes(raw)||result?.connected===false||result?.generationError||result?.baseline?.generationError||result?.augmented?.generationError?'knownfailure':'returned';
      const completed={...base,at:new Date().toISOString(),state,...(meta.area==='devices' && result?.requestId ? {receiptId:result.requestId}: {})};
      try {append(completed);}
      catch {persistenceError=true;events.push({...completed,persistenceWarning:true});}
      return result;
    },
  };
}
