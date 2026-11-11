import assert from 'node:assert/strict';
import {dockRuntimeView, initDockRuntime, dockRuntimeMounted} from '../src/ui/dock-runtime.js';

const nodes = new Map();
const node = selector => {
  if (!nodes.has(selector)) nodes.set(selector, {textContent:'', innerHTML:''});
  return nodes.get(selector);
};
const handlers = {};
const root = {isConnected:true, setAttribute(){}, querySelector:node, querySelectorAll:()=>[], addEventListener:(name, fn)=>{handlers[name]=fn;}};
globalThis.document = {querySelector:()=>root};
const calls = [];
let revision = 'r1';
globalThis.fetch = async (url, options = {}) => {
  calls.push({url, ...options});
  if(url==='/api/balance-monitor')return {ok:true,json:async()=>({intervalMinutes:60,threshold:5,connections:{dock:{balances:[{currency:'CNY',total:'4.99'}],checkedAt:'2026-11-10T09:00:00Z'}}})};
  if (options.method === 'POST') { revision = 'r2'; return {ok:true,json:async()=>({ok:true,message:'done'})}; }
  return {ok:true,json:async()=>({ok:true,revision,service:{status:'running'},groups:[{id:'bot',fields:[{key:'APP_SECRET',label:'App Secret',secret:true,value:'MUST_NOT_RENDER',configured:true},{key:'APP_ID',label:'App ID',value:'<unsafe>',source:'env'}]}]})};
};
const settle = () => new Promise(resolve=>setTimeout(resolve,10));
initDockRuntime({notify:()=>{}});
assert.match(dockRuntimeView(), /data-runtime-action="restart" disabled/);
dockRuntimeMounted(); await settle();
assert.equal(calls.length,2);
assert.match(node('[data-runtime-balance]').textContent,/CNY 4.99/);
assert.doesNotMatch(node('[data-runtime-groups]').innerHTML,/MUST_NOT_RENDER/);
assert.match(node('[data-runtime-groups]').innerHTML,/&lt;unsafe&gt;/);
assert.match(node('[data-runtime-groups]').innerHTML,/留空保持不变/);
const click = action => handlers.click({target:{closest:()=>({dataset:{runtimeAction:action}})}});
globalThis.confirm = () => false;
click('restart'); await settle(); assert.equal(calls.length,2);
globalThis.confirm = text => { assert.match(text,/AFTB-Bot/); return true; };
click('restart'); await settle();
assert.deepEqual(JSON.parse(calls[2].body),{action:'restart',revision:'r1',confirm:true});
const secret = {name:'APP_SECRET',value:'temporary-secret'};
const ordinary = {name:'APP_ID',value:'changed'};
const status = {textContent:''};
const checks = {replaceChildren(){},innerHTML:''};
const form = {dataset:{runtimeGroup:'bot'},querySelectorAll:selector=>selector==='input'?[secret,ordinary]:[secret],querySelector:selector=>selector==='[data-group-feedback]'?status:checks};
handlers.submit({target:{closest:()=>form},preventDefault(){},submitter:{dataset:{runtimeAction:'save'}}});
assert.equal(secret.value,'');
await settle();
assert.deepEqual(JSON.parse(calls[4].body),{action:'save',group:'bot',revision:'r2',values:{APP_SECRET:'temporary-secret',APP_ID:'changed'}});
assert.match(status.textContent,/已保存.*尚未重启/);
assert.equal(ordinary.value,'changed');
console.log('dock runtime UI contract tests passed (DOM/fetch doubles; no real service restart)');
