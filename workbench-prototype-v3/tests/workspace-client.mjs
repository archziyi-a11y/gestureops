import assert from 'node:assert/strict';
import { createWorkspaceClient } from '../src/ui/workspace-client.js';

const originalFetch = globalThis.fetch;
let current, paints = 0;
const notices = [], requests = [];
const client = createWorkspaceClient({
  onState: state => { current = state; },
  redraw: () => { paints++; },
  notify: (...args) => notices.push(args),
});
try {
  globalThis.fetch = async (_url, options) => {
    if (!options) return { ok: true, json: async () => ({ workspace: { version: 0 } }) };
    const action = JSON.parse(options.body);
    requests.push(action);
    await new Promise(resolve => setTimeout(resolve, 5));
    if (action.type === 'conflict') return {
      json: async () => ({ ok: false, message: 'version conflict', workspace: { version: 9 } }),
    };
    if (action.type === 'network-failure') throw new Error('offline');
    return { json: async () => ({ ok: true, workspace: { version: action.version + 1 } }) };
  };
  await client.load();
  assert.equal(current.version, 0);
  const first = client.mutate({ type: 'first' }, false);
  const second = client.mutate({ type: 'second' });
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(requests.map(r => r.version), [0, 1]);
  assert.equal(paints, 1);
  console.log('PASS ordered mutations preserve versions and repaint control');

  assert.equal(await client.mutate({ type: 'conflict' }), false);
  assert.equal(current.version, 9);
  assert.equal(paints, 1);
  assert.equal(await client.mutate({ type: 'after-conflict' }), true);
  assert.equal(requests.at(-1).version, 9);
  console.log('PASS conflict refreshes state without retrying rejected action');

  assert.equal(await client.mutate({ type: 'network-failure' }), false);
  assert.equal(await client.mutate({ type: 'after-failure' }), true);
  await client.settled();
  assert.equal(current.version, 11);
  assert.deepEqual(notices, [['version conflict', 'error'], ['offline', 'error']]);
  console.log('PASS failed request does not poison subsequent queue');
} finally {
  globalThis.fetch = originalFetch;
}
