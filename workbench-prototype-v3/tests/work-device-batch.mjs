import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeviceBatch } from '../src/domain/work-device-batch.js';

const dirs = [];
const makeDir = () => { const dir = mkdtempSync(join(tmpdir(), 'device-batch-')); dirs.push(dir); return dir; };
const fingerprint = 'a'.repeat(64);
function setup(options = {}) {
  const dir = options.dir || makeDir();
  const calls = [];
  const dependencies = {
    dir,
    readDevices: async () => ({ devices: options.devices || ['a', 'b'].map(id => ({ id, online: true })) }),
    release: { publish: async id => { calls.push(['publish', id]); return { app: { id: 'app', name: 'App', fingerprint, url: 'SECRET' } }; } },
    actions: { submit: async body => { calls.push(['submit', body]); return options.submit ? options.submit(body) : { state: 'accepted_not_verified', secret: 'SECRET' }; } },
  };
  return { dir, calls, dependencies, api: createDeviceBatch(dependencies) };
}
async function done(api, id) {
  for (let i = 0; i < 200; i++) {
    const row = api.get(id);
    if (!['running', 'preparing', 'publishing', 'dispatching'].includes(row.state)) return row;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('batch_timeout');
}
const request = { requestId: 'req', releaseId: 'release', deviceIds: ['a', 'b'] };
try {
  {
    const { api, dir, calls, dependencies } = setup();
    const row = api.start(request);
    assert.equal(row.state, 'running');
    assert.equal(JSON.parse(readFileSync(join(dir, 'work-device-batch.json')))[0].id, row.id);
    assert.equal(api.start({ ...request, deviceIds: ['b', 'a'] }).id, row.id);
    assert.throws(() => api.start({ ...request, releaseId: 'other' }), /request_id_conflict/);
    assert.throws(() => createDeviceBatch(dependencies).start({ ...request, requestId: 'other' }), /batch_in_progress/);
    const result = await done(api, row.id);
    assert.equal(result.state, 'completed');
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[1][1], { requestId: row.id + '-a', action: 'upgrade', deviceId: 'a', appId: 'app', appFingerprint: fingerprint });
    assert.equal(JSON.stringify(api.list()).includes('SECRET'), false);
    result.results[0].state = 'tampered';
    assert.equal(api.get(row.id).results[0].state, 'accepted_not_verified');
    assert.equal(api.get('missing'), null);
  }
  for (const mode of ['unknown', 'throw', 'partial', 'persistence']) {
    const { api, calls } = setup({ submit: body => {
      if (body.deviceId === 'a') return { state: 'accepted_not_verified' };
      if (mode === 'throw') throw new Error('SECRET');
      return mode === 'partial' ? { state: 'rejected' } : mode === 'persistence' ? { state: 'accepted_not_verified', persistenceWarning: 'receipt_persistence_failed' } : { state: 'submit_outcome_unknown' };
    }, devices: ['a', 'b', 'c'].map(id => ({ id, online: true })) });
    const row = api.start({ ...request, deviceIds: ['a', 'b', 'c'] });
    const result = await done(api, row.id);
    assert.equal(result.results[0].state, 'accepted_not_verified');
    assert.equal(result.state, mode === 'partial' ? 'partial' : mode === 'persistence' ? 'stopped' : 'submit_outcome_unknown');
    assert.equal(calls.filter(c => c[0] === 'submit').length, mode === 'partial' ? 3 : 2);
  }
  {
    const { api, calls } = setup({ devices: [{ id: 'a', online: false }, { id: 'b', online: true, upgradeBlock: 'work_client_upgrade_required' }] });
    const result = await done(api, api.start(request).id);
    assert.equal(result.state, 'completed');
    assert.deepEqual(result.results.map(r => r.message), ['device_offline', 'work_client_upgrade_required']);
    assert.equal(calls.length, 0);
  }
  {
    const { api, calls } = setup({ devices: [{ id: 'a', online: true }] });
    assert.equal((await done(api, api.start(request).id)).message, 'selected_device_missing');
    assert.equal(calls.length, 0);
  }
  {
    const dir = makeDir();
    writeFileSync(join(dir, 'work-device-batch.json'), JSON.stringify([{ ...request, id: 'restart', state: 'dispatching', results: [{ deviceId: 'a', state: 'accepted_not_verified' }, { deviceId: 'b', state: 'submitting' }] }]));
    const { api, calls } = setup({ dir });
    assert.equal(api.get('restart').state, 'interrupted');
    assert.equal(api.get('restart').results[0].state, 'accepted_not_verified');
    assert.equal(api.get('restart').results[1].state, 'submit_outcome_unknown');
    assert.equal(api.start(request).state, 'interrupted');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(calls.length, 0);
  }
  {
    let directory;
    const { api, dir, calls } = setup({ submit: () => {
      mkdirSync(join(directory, 'work-device-batch.json.tmp'));
      return { state: 'accepted_not_verified' };
    } });
    directory = dir;
    const result = await done(api, api.start(request).id);
    assert.equal(result.state, 'stopped');
    assert.equal(result.results[0].state, 'accepted_not_verified');
    assert.equal(calls.filter(c => c[0] === 'submit').length, 1);
    assert.throws(() => api.start({ ...request, requestId: 'next' }), /batch_persistence_failed/);
  }
  console.log('work-device-batch: all mock checks passed');
} finally {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}
