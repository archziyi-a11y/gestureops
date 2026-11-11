import assert from 'node:assert/strict';
import { createInfraCardReader, readInfraCards } from '../src/domain/infra-card-observations.js';

const calls = [];
const secret = 'PRIVATE_BODY_DO_NOT_RETURN';
const fixture = { tasks: [
  { profile: 'mkt_dock', detail: secret, notes: [{ result: 'confirmed', summary: secret }, { result: 'unknown' }] },
  { profile: 'other', notes: [{ result: 'failed' }] },
] };
const deps = {
  now: () => new Date('2026-11-10T02:00:00Z'),
  run: async (file, args, options) => {
    calls.push({ file, args, options });
    return file === 'docker' ? args[0]==='exec'?'200':(args.at(-1) === 'pxkb-n8n' ? 'restarting\n' : 'running\n') : 'Running\r\n';
  },
  read: async (file, options) => { assert.ok(file.endsWith('dock-operations.json')); assert.equal(options.encoding, 'utf8'); return JSON.stringify(fixture); },
};
const get = overrides => createInfraCardReader({ ...deps, ...overrides })({ root: process.cwd(), dir: process.cwd() });
const result = await get();
assert.equal(typeof readInfraCards, 'function');
assert.equal(result.observedAt, '2026-11-10T02:00:00.000Z');
assert.deepEqual(result.cards.map(c => c.id), ['bots', 'n8n', 'bridge', 'reports']);
assert.match(result.cards[1].detail, /pxkb-n8n: restarting/);
assert.equal(result.cards[1].infra.items[0].state, 'starting');
assert.equal(result.cards[1].infra.readiness.state, 'ready');
assert.match(result.cards[1].fact, /启动中 1/);
assert.match(result.cards[2].fact, /1 项任务、2 条/);
assert.match(result.cards[2].detail, /未经独立核验/);
assert.equal(result.cards[3].status, 'unknown');
assert.ok(!JSON.stringify(result).includes(secret));
assert.ok(!JSON.stringify(result).includes('45'));
assert.equal(calls.length, 6);
for (const call of calls) {
  assert.equal(call.options.timeout, 10000);
  assert.equal(call.options.windowsHide, true);
  if (call.file === 'docker'&&call.args[0]!=='exec') assert.deepEqual(call.args.slice(0, 4), ['container', 'inspect', '--format', '{{.State.Status}}']);
}
const failed = await get({ run: async (file, args) => {
  if (file === 'powershell.exe' && args.at(-1).includes("'AFTB-Bot'")) throw new Error(secret);
  return file === 'docker' ? 'exited' : 'Stopped';
}, read: async () => { throw Object.assign(new Error(secret), { code: 'ENOENT' }); } });
assert.equal(failed.cards[0].status, 'partial');
assert.match(failed.cards[0].detail, /PXKB-Bot: Stopped/);
assert.equal(failed.cards[1].status, 'partial');
assert.equal(failed.cards[0].infra.items[0].state, 'error');
assert.equal(failed.cards[0].infra.counts.stopped, 2);
assert.equal(failed.cards[1].infra.readiness.state, 'error');
assert.match(failed.cards[1].fact, /读取失败/);
assert.equal(failed.cards[2].status, 'unknown');
assert.ok(!JSON.stringify(failed).includes(secret));
const malformed = await get({ run: async () => secret, read: async () => '{' });
assert.equal(malformed.cards[0].status, 'unknown');
assert.equal(malformed.cards[1].status, 'unknown');
assert.equal(malformed.cards[2].status, 'unknown');
assert.ok(!JSON.stringify(malformed).includes(secret));
const notReady = await get({ run: async (file, args) => file === 'docker' ? args[0] === 'exec' ? '503' : 'running' : 'StartPending' });
assert.equal(notReady.cards[0].infra.counts.starting, 3);
assert.equal(notReady.cards[1].infra.readiness.state, 'not_ready');
assert.match(notReady.cards[1].fact, /就绪检查未通过/);
const empty = await get({ read: async () => '{"tasks":[]}' });
assert.match(empty.cards[2].fact, /0 项任务、0 条/);
let aborted = 0;
const hang = (...args) => { args.at(-1).signal.addEventListener('abort', () => aborted++); return new Promise(() => {}); };
const timeout = await get({ run: hang, read: hang, timeoutMs: 5 });
assert.equal(aborted, 7);
assert.ok(timeout.cards.slice(0, 3).every(c => c.status === 'unknown'));
assert.match(timeout.cards[0].detail, /读取超时/);
assert.throws(() => createInfraCardReader({ timeoutMs: 10001 }));
console.log('infra-card-observations: PASS (offline; no processes or business data accessed)');
