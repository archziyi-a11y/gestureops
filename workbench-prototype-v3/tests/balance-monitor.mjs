import {createBalanceMonitor} from '../src/domain/balance-monitor.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'balance-test-'));
let time=1000000,calls=0,total='4.99',fail=false,currency='CNY';
const query=async()=>{calls++;if(fail)throw Error('network');return {balances:[{currency,total}],revision:'one',checkedAt:new Date(time).toISOString()};};
try{
 const m=createBalanceMonitor({dir,query,now:()=>time});
 await m.tick();assert.equal(calls,3);assert.equal(m.snapshot().alerts.length,3);
 await m.tick();assert.equal(calls,3);
 await m.check('sales');assert.equal(m.snapshot().events.length,3,'no repeated low event');
 total='5';await m.check('sales');assert.equal(m.snapshot().connections.sales.status,'ok');assert.equal(m.snapshot().events.at(-1).type,'balance_recovered');
 fail=true;await assert.rejects(m.check('sales'));assert.equal(m.snapshot().connections.sales.balances[0].total,'5');assert.ok(m.snapshot().connections.sales.error);
 fail=false;currency='USD';await m.check('sales');assert.equal(m.snapshot().connections.sales.status,'unknown');
 currency='CNY';total='';await m.check('sales');assert.equal(m.snapshot().connections.sales.status,'unknown');
 total='1';await Promise.all([m.check('sales'),m.check('sales')]);assert.equal(m.snapshot().connections.sales.status,'low');
 const restored=createBalanceMonitor({dir,query,now:()=>time});assert.equal(restored.snapshot().connections.sales.status,'low');
 const before=calls;await restored.tick();assert.equal(calls,before,'restart respects schedule');
 assert.throws(()=>m.configure({intervalMinutes:0,threshold:5}));
 m.configure({intervalMinutes:5,threshold:0.5});assert.equal(m.snapshot().connections.sales.status,'ok');
 time+=300001;await m.tick();assert.equal(calls,before+3);
 console.log('PASS: threshold, recovery, repeat suppression, failure retention, currency, persistence, scheduling, settings, in-flight sharing');
}finally{rmSync(dir,{recursive:true,force:true});}
