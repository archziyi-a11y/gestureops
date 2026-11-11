import {readFile,stat} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const script="$ErrorActionPreference='Stop'; $t=Get-ScheduledTask -TaskName 'GEO-OpenClaw-Write-Validation'; $i=$t|Get-ScheduledTaskInfo; @{state=$t.State.ToString();last=$i.LastRunTime.ToString('o');next=$i.NextRunTime.ToString('o');result=$i.LastTaskResult;triggers=@($t.Triggers|Select-Object DaysOfWeek,WeeksInterval,StartBoundary)}|ConvertTo-Json -Depth 4 -Compress";
export async function readGeoCards({root,dependencies={}}){
  const observedAt=new Date().toISOString();
  const base={id:'geo',source:'GEO-OpenClaw-Write-Validation / validation-ledger / orchestrate-summary'};
  try{
    if(!dependencies.run && resolve(root).toLowerCase()!==resolve('D:/Dev/smart-customer-service').toLowerCase())throw Error('isolated');
    const home=dependencies.home||'D:/Dev/openclaw-geo';
    const assetPath=dependencies.assets||process.env.GESTUREOPS_GEO_ASSETS;
    if(!assetPath)throw Error('GEO assets directory is not configured');
    const assets=resolve(assetPath);
    const {stdout}=await (dependencies.run||execute)('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000,maxBuffer:65536});
    const task=JSON.parse(stdout.replace(/^\uFEFF/,''));
    if(!['Ready','Running','Disabled','Queued'].includes(task.state)||!Number.isInteger(task.result)||![task.last,task.next].every(t=>typeof t==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(t)&&Number.isFinite(Date.parse(t))))throw Error('task');
    const ledger=(await readFile(join(home,'logs/validation-ledger.jsonl'),'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(r=>r.dry_run===false);
    const last=ledger.at(-1);
    if(!last||!/^\d{4}-\d{2}-\d{2}$/.test(last.date)||!Number.isFinite(Date.parse(last.ts)))throw Error('ledger');
    const report=JSON.parse(await readFile(join(home,`logs/write-${last.date}/orchestrate-summary.json`),'utf8'));
    if(report.date!==last.date||report.dry_run!==false||!Array.isArray(report.results)||!report.results.length)throw Error('report');
    let passed=0,gatePassed=0,nonEmpty=0,outputKnown=true;
    for(const r of report.results){
      const file=resolve(r.gate?.path||'');const rel=relative(assets,file);
      if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('scope');
      if(r.gate.ok===true)gatePassed++;
      let valid=false;
      try{const info=await stat(file);valid=info.isFile()&&info.size>0;}catch(e){if(e.code!=='ENOENT')outputKnown=false;}
      if(valid)nonEmpty++;
      if(r.gate.ok===true && valid)passed++;
    }
    const t=task.triggers?.[0];
    const rhythm=task.triggers?.length===1&&t.DaysOfWeek===62&&t.WeeksInterval===1?`周一至周五 ${t.StartBoundary.slice(11,16)}（北京时间）`:'运行频率需核对';
    const stale=Date.parse(task.next)<Date.parse(observedAt)&&task.state!=='Running';
    const current=Date.parse(last.ts)>=Date.parse(task.last)&&Date.parse(last.ts)<=Date.parse(observedAt);
    const ok=task.result===0&&last.status==='ok'&&report.all_gates_passed===true&&passed===report.results.length;
    const issue=task.state==='Disabled'?'自动撰稿已暂停':stale?'调度记录已过期':task.state==='Running'?null:!current?'本次撰稿结果尚未落盘':!ok?'最近撰稿或质量检查未完成':null;
    const geo={task:{state:task.state,last:task.last,next:task.next,result:task.result},batch:{date:last.date,receiptTime:last.ts,dryRun:last.dry_run},gates:{passed:report.results.every(r=>typeof r.gate?.ok==='boolean')?gatePassed:null,total:report.results.length},outputs:{nonEmpty:outputKnown?nonEmpty:null,total:report.results.length},currentReceipt:current};
    return {observedAt,cards:[{...base,geo,status:'observed',fact:issue|| (task.state==='Running'?'正在自动撰稿':`最近已成稿 ${passed} 篇 · 自动发布关闭`),summary:`${rhythm}；最近成稿批次 ${last.date}。`,detail:`下次计划 ${task.next}；最近启动 ${task.last}；结束码 ${task.result}。成稿回执 ${last.ts}，${passed}/${report.results.length} 篇规则门禁通过且文件非空；未重新审核内容事实或发布效果。Windows 调度与本地回执时钟，读取时刻 ${observedAt}。当前 D034 仅写稿验证，禁止自动发布。n8n 的辅助流程不代表此撰稿任务。`,...(issue?{issue,severity:'unknown'}:{})}]};
  }catch{return {observedAt,cards:[{...base,geo:{task:null,batch:null,gates:null,outputs:null,currentReceipt:null},status:'unknown',fact:'暂未取得自动撰稿结果',summary:'无法核对调度、成稿回执或稿件文件。',detail:'读取失败不代表没有稿件；未触发写稿、发布或恢复停用任务。',issue:'撰稿运行记录需核对',severity:'unknown'}]};}
}
