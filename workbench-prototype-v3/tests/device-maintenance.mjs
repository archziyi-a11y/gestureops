import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialSalesOperations, salesOperationsAction as act } from '../src/domain/sales-operations.js';
test('inspection needs no technical ID and does not populate a fake device list',()=>{
  const s=act(initialSalesOperations(),{type:'device-maintenance',operation:'inspect',label:''});
  assert.equal(s.tasks[0].subject,'全部工作机'); assert.equal(s.devices.length,0);
  assert.match(s.tasks[0].detail,/不是在线心跳/); assert.match(s.tasks[0].detail,/无版本上报/);
});
test('upgrade and revoke require a target, remain preparations',()=>{
  for(const operation of ['upgrade','revoke']) {
    assert.throws(()=>act(initialSalesOperations(),{type:'device-maintenance',operation,label:''}));
    const s=act(initialSalesOperations(),{type:'device-maintenance',operation,label:'销售03',note:'待确认'});
    assert.equal(s.tasks[0].status,'待智能体接手'); assert.equal(s.devices.length,0);
    assert.match(s.history[0].scope,/未执行生产/);
  }
  const r=act(initialSalesOperations(),{type:'device-maintenance',operation:'revoke',label:'销售03'});
  assert.match(r.tasks[0].detail,/同名必须消歧/); assert.match(r.tasks[0].detail,/不删除手机资料/);
});
test('invalid intent rejected; add keeps authorization boundaries',()=>{
  assert.throws(()=>act(initialSalesOperations(),{type:'device-maintenance',operation:'wipe',label:'x'}));
  const s=act(initialSalesOperations(),{type:'device-request',label:'销售03',days:90});
  assert.equal(s.devices[0].status,'待签发'); assert.match(s.tasks[0].detail,/一机一份/);
});
