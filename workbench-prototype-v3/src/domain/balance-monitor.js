import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function createBalanceMonitor({dir, query, now=()=>Date.now()}) {
  mkdirSync(dir,{recursive:true});
  const file=join(dir,'balance-monitor.json');
  let state;
  try { state=JSON.parse(readFileSync(file,'utf8')); }
  catch(e) { if(e.code!=='ENOENT')throw e; state={intervalMinutes:60,threshold:5,connections:{},events:[]}; }
  const inFlight=new Map(); let timer;
  const persist=()=>{writeFileSync(file+'.tmp',JSON.stringify(state));renameSync(file+'.tmp',file);};
  function classify(id) {
    const row=state.connections[id], previous=row.status;
    const cny=row.balances?.find(b=>b.currency==='CNY');
    const amount=cny && String(cny.total).trim()!=='' ? Number(cny.total) : NaN;
    row.status=Number.isFinite(amount)?(amount<state.threshold?'low':'ok'):'unknown';
    if(row.status!==previous) {
      row.changedAt=new Date(now()).toISOString();
      if(row.status==='low'||previous==='low') {
        state.events.push({id:`${id}:${now()}:${state.events.length}`,connection:id,type:row.status==='low'?'balance_low':row.status==='ok'?'balance_recovered':'balance_unknown',at:row.changedAt});
        state.events=state.events.slice(-200);
      }
    }
  }
  function record(id,result) {
    const row=state.connections[id]||{};
    if(row.revision && row.revision!==result.revision) row.status='unknown';
    state.connections[id]={...row,balances:result.balances,revision:result.revision,checkedAt:result.checkedAt,lastAttemptAt:new Date(now()).toISOString(),error:null,errorCode:null};
    classify(id); persist();
  }
  function check(id) {
    if(!['sales','knowledge','dock'].includes(id))return Promise.reject(Error('未知连接'));
    if(inFlight.has(id))return inFlight.get(id);
    const job=(async()=>{
      try { const result=await query(id);record(id,result);return result; }
      catch(e) {
        const errorCode=['balance_unavailable','balance_unsupported','balance_endpoint_unavailable'].includes(e.code)?e.code:null;
        state.connections[id]={...state.connections[id],lastAttemptAt:new Date(now()).toISOString(),error:'余额更新失败，等待下次检查',errorCode};
        persist();throw e;
      } finally { inFlight.delete(id); }
    })();
    inFlight.set(id,job);return job;
  }
  async function tick() {
    for(const id of ['sales','knowledge','dock']) {
      const at=Date.parse(state.connections[id]?.lastAttemptAt||'');
      if(!Number.isFinite(at)||now()-at>=state.intervalMinutes*60000) await check(id).catch(()=>{});
    }
  }
  return {
    check, tick,
    snapshot:()=>structuredClone({...state,alerts:Object.entries(state.connections).filter(([,r])=>r.status==='low').map(([id,r])=>({id:`balance:${id}`,connection:id,type:'balance_low',severity:'warning',checkedAt:r.checkedAt,stale:!!r.error,href:id==='dock'?'#/p/bridge/w/runtime':'#/p/sales/w/runtime'}))}),
    configure({intervalMinutes,threshold}) {
      if(!Number.isInteger(intervalMinutes)||intervalMinutes<5||intervalMinutes>1440||!Number.isFinite(threshold)||threshold<0||threshold>100000)throw Error('检查间隔须为 5–1440 分钟，阈值须为 0–100000 元');
      state.intervalMinutes=intervalMinutes;state.threshold=threshold;
      for(const id of Object.keys(state.connections))if(state.connections[id].balances)classify(id);
      persist();return this.snapshot();
    },
    start(){if(timer)return;void tick();timer=setInterval(()=>void tick(),60000);timer.unref();},
    stop(){clearInterval(timer);timer=null;},
  };
}
