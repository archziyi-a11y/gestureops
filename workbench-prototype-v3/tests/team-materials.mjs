import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTeamMaterials } from '../src/domain/team-materials.js';
const payload = { requestId: '12345678-1234-1234-1234-123456789012', title: 'Test', content: 'hello' };
test('delete reports confirmed, rejected and unknown separately',async()=>{
 for(const result of [{id:'x',deleted:true},{status:'knownfailure',httpStatus:409},{}]){
  const service=createTeamMaterials({run:async()=>result});
  assert.equal((await service.remove({id:'x',title:'Test'})).status,result.deleted?'knownsuccess':result.status||'unknown');
 }
 const service=createTeamMaterials({run:async()=>{throw Error('timeout');}});
 assert.equal((await service.remove({id:'x',title:'Test'})).status,'unknown');
 await assert.rejects(service.remove({id:'../x',title:'Test'}));
});
test('definite rejection is persisted and never resent with same request ID', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'team-materials-')); let calls = 0;
  const run = async () => { calls++; return { status: 'knownfailure', httpStatus: 422 }; };
  try {
    assert.equal((await createTeamMaterials({dir, run}).upload(payload)).status, 'knownfailure');
    assert.equal((await createTeamMaterials({dir, run}).upload(payload)).httpStatus, 422);
    assert.equal(calls, 1);
  } finally { await rm(dir, {recursive:true}); }
});
test('receipt deduplication, conflict and restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'team-materials-')); let calls = 0;
  const run = async () => { calls++; return { id: 'material', type: 'TEXT' }; };
  try {
    const service = createTeamMaterials({ dir, run });
    assert.equal((await service.upload(payload)).status, 'knownsuccess');
    assert.equal((await createTeamMaterials({ dir, run }).upload(payload)).status, 'knownsuccess');
    await assert.rejects(service.upload({ ...payload, content: 'other' }), /conflict/);
    assert.equal(calls, 1);
  } finally { await rm(dir, { recursive: true }); }
});
test('unknown never resends', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'team-materials-')); let calls = 0;
  const run = async () => { calls++; throw Error('timeout'); };
  try { const s = createTeamMaterials({ dir, run }); assert.equal((await s.upload(payload)).status, 'unknown'); await s.upload(payload); await createTeamMaterials({dir, run}).upload(payload); assert.equal(calls, 1); }
  finally { await rm(dir, { recursive: true }); }
});
test('revision change rejects entire snapshot and image path is constrained', async () => {
  const s = createTeamMaterials({ run: async ({offset}) => ({ materials: [], revision: String(offset), next_offset: offset ? null : 200 }) });
  await assert.rejects(s.read(), /revision_changed/);
  await assert.rejects(s.image('https://example.com'), /invalid_material_id/);
  await assert.rejects(s.upload({...payload, content: undefined, base64: Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64')}), /8mb/);
});
