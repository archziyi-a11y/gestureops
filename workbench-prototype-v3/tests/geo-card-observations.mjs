import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readGeoCards} from '../src/domain/geo-card-observations.js';
const home=await mkdtemp(join(tmpdir(),'geo-cards-'));
try{
 const assets=join(home,'assets');await mkdir(assets);
 const date='2026-01-01';await mkdir(join(home,`logs/write-${date}`),{recursive:true});
 const path=join(assets,'draft.md');await writeFile(path,'test');
 await writeFile(join(home,'logs/validation-ledger.jsonl'),JSON.stringify({date,ts:date+'T10:31:00+08:00',status:'ok',dry_run:false}));
 const report={date,dry_run:false,all_gates_passed:true,results:[{gate:{path,ok:true}}]};
 const save=()=>writeFile(join(home,`logs/write-${date}/orchestrate-summary.json`),JSON.stringify(report));await save();
 const task={state:'Ready',last:date+'T10:30:00+08:00',next:'2099-01-01T10:30:00+08:00',result:0,triggers:[{DaysOfWeek:62,WeeksInterval:1,StartBoundary:date+'T10:30:00+08:00'}]};
 const dependencies={home,assets,run:async(cmd,args)=>{assert.ok(args.at(-1).includes('Get-ScheduledTask'));assert.ok(!args.at(-1).includes('Start-ScheduledTask'));return {stdout:JSON.stringify(task)};}};
 const read=async()=> (await readGeoCards({root:home,dependencies})).cards[0];
 const initial=await read();assert.match(initial.fact,/已成稿 1 篇/);
 assert.deepEqual(initial.geo,{task:{state:task.state,last:task.last,next:task.next,result:0},batch:{date,receiptTime:date+'T10:31:00+08:00',dryRun:false},gates:{passed:1,total:1},outputs:{nonEmpty:1,total:1},currentReceipt:true});
 task.last=date+'T10:32:00+08:00';const historical=await read();assert.equal(historical.geo.currentReceipt,false);assert.match(historical.fact,/尚未落盘/);task.last=date+'T10:30:00+08:00';
 await writeFile(path,'');const empty=await read();assert.deepEqual(empty.geo.gates,{passed:1,total:1});assert.deepEqual(empty.geo.outputs,{nonEmpty:0,total:1});await writeFile(path,'test');
 task.state='Disabled';assert.match((await read()).fact,/已暂停/);
 task.state='Ready';task.next=date+'T11:00:00+08:00';assert.match((await read()).fact,/过期/);
 task.next='2099-01-01T10:30:00+08:00';report.results[0].gate.ok=false;await save();assert.match((await read()).fact,/未完成/);
 report.results[0].gate.path=join(home,'outside');await save();assert.equal((await read()).status,'unknown');
 assert.equal((await readGeoCards({root:home})).cards[0].status,'unknown');
 console.log('PASS GEO: draft receipt, paused, stale, gate failure, path scope, isolated roots');
}finally{await rm(home,{recursive:true,force:true});}
