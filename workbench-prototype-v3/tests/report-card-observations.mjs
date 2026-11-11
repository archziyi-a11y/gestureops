import assert from 'node:assert/strict';
import { createReportCardReader } from '../src/domain/report-card-observations.js';

const now = () => new Date('2026-11-10T06:00:00Z');
const row = (status, count = 1) => ({ workflow: 'PDDR daily', status, count, firstStartedAt: null, lastStartedAt: null, lastStoppedAt: null });
async function read(rows, latest = rows.map(r=>({workflow:r.workflow,active:true,status:r.status,time:r.lastStartedAt,reason:r.status==='error'?'quota':null,schedule:['30 7 * * *'],timezone:'Asia/Shanghai'}))) {
  return (await createReportCardReader({ now, run: async (file, args) => {
    assert.equal(file, 'docker');
    assert.deepEqual(args.slice(0, 4), ['exec', 'pxkb-n8n', 'node', '-e']);
    assert.match(args[4], /sqlite.OPEN_READONLY/);
    assert.doesNotMatch(args[4], /SELECT \*|process.env|INSERT|UPDATE|DELETE/);
    assert.match(args[4], /classify/);
    assert.deepEqual(args.slice(-2), ['2026-11-03T06:00:00.000Z', '2026-11-10T06:00:00.000Z']);
    return JSON.stringify({rows,latest});
  } })({ root: process.cwd() })).cards[0];
}
assert.equal((await read([row('success')])).issue, undefined);
assert.equal((await read([row('error')])).severity, 'unknown');
assert.equal((await read([row('crashed'), row('canceled')])).severity, 'unknown');
assert.equal((await read([])).issue, undefined);
const webhook = await read([], [{workflow:'pxkb-manual',active:true,status:null,time:null,reason:null,schedule:[],trigger:'webhook',timezone:'instance'}]);
assert.match(webhook.detail,/外部\/手动触发，无执行不判故障/);
assert.equal(webhook.issue,undefined);
const parsing = await read([], [{workflow:'pxkb-merge',active:true,status:'error',time:null,reason:'response_format',schedule:[],timezone:'instance'}]);
assert.match(parsing.fact,/JSON 解析失败/);
assert.doesNotMatch(parsing.fact,/上游数据返回异常/);
assert.match((await read([])).fact, /未启用/);
assert.match((await read([row('error')])).fact,/配额已用尽/);
assert.equal((await read([row('error')],[{workflow:'PDDR daily',active:true,status:'success',time:null,reason:null,schedule:[],timezone:'Asia/Shanghai'}])).issue,undefined);
assert.equal((await read([row('error')],[{workflow:'PDDR daily',active:false,status:'error',time:null,reason:'quota',schedule:[],timezone:'Asia/Shanghai'}])).issue,undefined);
assert.equal((await read([row('success'), { ...row(null, 0), workflow: 'PXKB' }])).issue, undefined);
assert.equal((await read([row('running')])).issue, undefined);
assert.match((await read([{...row('success'),lastStartedAt:'2026-11-10 05:00:00'}])).detail,/13:00:00.000/);
assert.equal((await read([row('success', -1)])).status, 'unknown');
assert.match((await read([])).detail, /14:00:00.000 \+08:00/);
for (const run of [async () => { throw new Error('secret payload'); }, async () => 'invalid', () => new Promise(() => {})]) {
  const result = await createReportCardReader({ now, run, timeoutMs: 10 })({ root: process.cwd() });
  assert.equal(result.cards[0].status, 'unknown');
  assert.doesNotMatch(JSON.stringify(result), /secret payload/);
}
console.log('report-card-observations: offline checks passed');
