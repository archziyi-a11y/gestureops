import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeviceActions } from '../src/domain/work-device-actions.js';

const body = { requestId: 'r1', deviceId: 'd1', appId: 'a1', appFingerprint: 'a'.repeat(64), action: 'install' };
const directory = () => mkdtempSync(join(tmpdir(), 'device-actions-'));
test('persist before write, block inflight and accepted, reject request ID conflicts', async () => {
  const dir = directory();
  let finish, calls = 0;
  const actions = createDeviceActions({ root: '.', dir, run: async () => {
    calls++;
    assert.equal(JSON.parse(readFileSync(join(dir, 'work-device-actions.json')))[0].state, 'pending');
    return new Promise(resolve => { finish = resolve; });
  } });
  const pending = actions.submit(body);
  assert.equal((await actions.submit({ ...body, requestId: 'r2' })).state, 'submit_outcome_unknown');
  finish({ state: 'accepted_not_verified', appUrl: 'secret' });
  assert.equal((await pending).state, 'accepted_not_verified');
  await actions.submit(body);
  await actions.submit({ ...body, requestId: 'r3' });
  assert.equal(calls, 1);
  assert.equal(actions.history()[0].appUrl, undefined);
  await assert.rejects(actions.submit({ ...body, deviceId: 'other' }), /conflict/);
});
test('unknown blocks retry; rejected allows a new request', async () => {
  for (const state of ['rejected', 'submit_outcome_unknown']) {
    let calls = 0;
    const actions = createDeviceActions({ root: '.', dir: directory(), run: async () => {
      calls++;
      if (state !== 'rejected') throw Error('private upstream message');
      return { state };
    } });
    assert.equal((await actions.submit(body)).state, state);
    await actions.submit(body);
    await actions.submit({ ...body, requestId: 'r2' });
    assert.equal(calls, state === 'rejected' ? 2 : 1);
  }
});
test('restart converts durable pending to unknown without running', async () => {
  const dir = directory();
  writeFileSync(join(dir, 'work-device-actions.json'), JSON.stringify([{ ...body, state: 'pending' }]));
  const actions = createDeviceActions({ root: '.', dir, run: () => { throw Error('must not run'); } });
  assert.equal((await actions.submit(body)).state, 'submit_outcome_unknown');
  assert.equal(actions.history()[0].state, 'submit_outcome_unknown');
});
test('catalog projects only public fields', async () => {
  const actions = createDeviceActions({ root: '.', dir: directory(), run: async () => ({ apps: [{ id: 'a', name: 'A', fingerprint: 'f', appUrl: 'secret' }] }) });
  assert.deepEqual(await actions.catalog(), { apps: [{ id: 'a', name: 'A', fingerprint: 'f' }] });
  await assert.rejects(actions.submit({ ...body, action: 'configure' }), /invalid/);
});

test('final persistence failure preserves acceptance and warns', async () => {
  const dir = directory();
  const actions = createDeviceActions({ root: '.', dir, run: async () => {
    mkdirSync(join(dir, 'work-device-actions.json.tmp'));
    return { state: 'accepted_not_verified', appName: 'SASALELE v35' };
  } });
  const result = await actions.submit(body);
  assert.equal(result.state, 'accepted_not_verified');
  assert.equal(result.appName, 'SASALELE v35');
  assert.equal(result.persistenceWarning, 'receipt_persistence_failed');
  assert.equal(actions.history()[0].persistenceWarning, result.persistenceWarning);
});

test('safe reasons and app name persist; raw runner messages do not', async () => {
  const dir = directory();
  const actions = createDeviceActions({ root: '.', dir, run: async () => ({ state: 'rejected', message: 'app_changed', appName: 'v35' }) });
  assert.equal((await actions.submit(body)).message, 'app_changed');
  assert.equal(JSON.parse(readFileSync(join(dir, 'work-device-actions.json')))[0].appName, 'v35');
});
