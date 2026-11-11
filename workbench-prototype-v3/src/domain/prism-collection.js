import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

const read = path => JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
export function createPrismCollection({root,dir,exportsDir='D:/教研资产/Prism/exports',launch=spawn}) {
  mkdirSync(dir,{recursive:true});
  const file=join(dir,'collection-jobs.json');
  let jobs=existsSync(file)?read(file):[];
  // A restart cannot prove whether an interrupted external download completed.
  for(const job of jobs)if(job.status==='running'){job.status='unknown';job.message='工作台曾重启，请先核对归档再重新下载';}
  const save=()=>{writeFileSync(file+'.tmp',JSON.stringify(jobs,null,2));renameSync(file+'.tmp',file);};
  save();
  let running=false;
  function archives() {
    if(!existsSync(exportsDir))return [];
    return readdirSync(exportsDir,{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name.startsWith('feishu-teacher-library-')).map(d=>{
      try {
        const path=join(exportsDir,d.name),m=read(join(path,'manifest.json'));
        let n;try{n=read(join(path,'derived/normalization-report.json'));}catch{}
        return {id:d.name,path,createdAt:m.createdAt,completedAt:m.completedAt,status:m.status,stats:m.stats||{},notes:n?.teachingNoteCandidates??null,
          errors:(m.errors||[]).map(e=>({stage:e.stage,error:e.apiCode===99991403?'飞书本月 API 额度已用尽':e.error,nodeToken:e.nodeToken||e.rootToken||''})),normalized:Boolean(n)};
      }catch{return {id:d.name,status:'unreadable',path:join(exportsDir,d.name),stats:{},errors:[]};}
    }).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||b.id.localeCompare(a.id));
  }
  return {
    snapshot(){return {jobs,archives:archives()};},
    start(body){
      if(running)throw Error('已有采集任务正在运行');
      if(!body||!['images','notes'].includes(body.kind)||Object.keys(body).some(k=>!['kind','since','subjects'].includes(k)))throw Error('无效采集参数');
      if(body.kind==='images'&&body.since!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(body.since)||new Date(body.since).toISOString().slice(0,10)!==body.since||body.since>new Date(Date.now()+8*3600000).toISOString().slice(0,10)))throw Error('起始日期无效或晚于今天');
      if(body.kind==='notes'&&(!Array.isArray(body.subjects)||!body.subjects.length||body.subjects.length>3||body.subjects.some(s=>!['color','sketch','quick'].includes(s))||new Set(body.subjects).size!==body.subjects.length))throw Error('请选择科目目录');
      if(body.kind==='images'&&!body.since)body={...body,since:new Date(Date.now()+8*3600000-2*86400000).toISOString().slice(0,10)};
      const id=randomUUID(),job={id,kind:body.kind,status:'running',createdAt:new Date().toISOString(),stage:'正在启动',request:body};
      if(body.kind==='notes')job.output=join(exportsDir,`feishu-teacher-library-${Date.now()}-${id.slice(0,8)}`);
      jobs.unshift(job);save();running=true;
      const python=resolve(root,'../.venv/Scripts/python.exe');
      let child;
      const finish=(status,message)=>{if(job.status!=='running')return;job.status=status;job.message=message;job.completedAt=new Date().toISOString();running=false;save();};
      try {
        child=launch(existsSync(python)?python:'python',[join(root,'scripts/prism-collect.py')],{cwd:resolve(root,'..'),windowsHide:true,shell:false,env:{...process.env,PYTHONUTF8:'1'},stdio:['pipe','pipe','pipe']});
        let buffer='',receipt;
        child.stdout.on('data',chunk=>{
          buffer+=chunk.toString();
          let split;
          while((split=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,split);buffer=buffer.slice(split+1);try{const value=JSON.parse(line);if(value.done)receipt=value;else if(value.stage){job.stage=value.stage;save();}}catch{}}
        });
        child.stderr.resume();
        child.stdin.on('error',()=>{});
        child.on('error',()=>finish('failed','无法启动采集进程'));
        child.on('close',()=>{if(receipt){job.counts=receipt.counts;job.runId=receipt.runId;finish(receipt.status,receipt.message);}else finish('unknown','进程结束但未取得结果，请核对归档');});
        child.stdin.end(JSON.stringify({...body,output:job.output}));
      }catch{finish('failed','无法启动采集进程');}
      return job;
    }
  };
}
