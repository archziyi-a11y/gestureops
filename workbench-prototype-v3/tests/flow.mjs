// 端到端验收：只通过 HTTP 操作，不碰内部对象。
// 重点验证：复制不推进作业；只有匹配回执才推进；换目标让旧授权失效；重启后事实还在。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const PORT = Number(process.env.TEST_PORT || 5199);
const STATE_DIR = mkdtempSync(join(tmpdir(), 'wb-v3-'));
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function start() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), STATE_DIR },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(String(d)));
  return child;
}

async function waitReady(tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function getState() {
  const res = await fetch(`${BASE}/api/state`);
  const json = await res.json();
  return json.state;
}

async function act(type, payload = {}) {
  const res = await fetch(`${BASE}/api/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, ...payload })
  });
  return res.json();
}

const jobOf = (state, id = 'JOB-2406') => state.jobs[id];
const stageOf = (state, id = 'JOB-2406') => state.derived.jobs[id].stage;

let server = start();
const ready = await waitReady();
if (!ready) {
  console.error('服务没起来，终止。');
  process.exit(1);
}

console.log('\n[1] 初始事实');
{
  const state = await getState();
  check('初始阶段是待检查', stageOf(state) === 'pending_check', stageOf(state));
  check('初始没有授权', jobOf(state).migration.authorization === null);
  check('初始没有提示词', jobOf(state).migration.package === null);
  check('三个项目 + 一个空位', state.slots.filter(Boolean).length === 3 && state.slots.length === 4);
}

console.log('\n[2] 仪表盘左右切项目（走服务端）');
{
  await act('set_project', { projectId: 'prism' });
  let state = await getState();
  check('切到 Prism 后刷新仍是 Prism', state.activeProjectId === 'prism', state.activeProjectId);
  await act('set_project', { projectId: 'sales' });
  state = await getState();
  check('切回销售助手', state.activeProjectId === 'sales');
}

console.log('\n[3] 选目标与凭据引用');
{
  const r1 = await act('set_target', { jobId: 'JOB-2406', targetId: 'isl-03' });
  check('可以选 isl-03', r1.ok && r1.state.jobs['JOB-2406'].migration.targetId === 'isl-03');
  const r2 = await act('set_credential', { jobId: 'JOB-2406', refId: 'local-key-ref-03' });
  check('可以换凭据引用', r2.ok && r2.state.jobs['JOB-2406'].migration.credentialRefId === 'local-key-ref-03');
  const r3 = await act('toggle_scope', { jobId: 'JOB-2406', key: 'materials' });
  check('可以改范围（关掉团队物料）', r3.ok && r3.state.jobs['JOB-2406'].migration.scope.materials === false);
  const r4 = await act('toggle_scope', { jobId: 'JOB-2406', key: 'materials' });
  check('再打开团队物料', r4.ok && r4.state.jobs['JOB-2406'].migration.scope.materials === true);
}

console.log('\n[4] 未检查时不能授权');
{
  const r = await act('authorize', { jobId: 'JOB-2406' });
  check('无检查 → 授权被拒', r.ok === false, r.message);
}

console.log('\n[5] 检查 → 授权 → 生成提示词');
{
  const c = await act('run_check', { jobId: 'JOB-2406' });
  check('五项检查通过', c.ok === true && c.state.derived.jobs['JOB-2406'].stage === 'checked', c.message);

  const a = await act('authorize', { jobId: 'JOB-2406' });
  check('检查通过后可以授权', a.ok === true && a.state.derived.jobs['JOB-2406'].stage === 'authorized', a.message);

  const p = await act('build_prompt', { jobId: 'JOB-2406' });
  const st = p.state;
  check('生成了提示词', Boolean(jobOf(st).migration.package));
  const pkg = jobOf(st).migration.package;
  check('提示词带当前目标', p.promptText.includes('isl-03 · 北京隔离区'), p.promptText.slice(0, 80));
  check('提示词带包编号', p.promptText.includes(pkg.id), pkg.id);
  check('提示词带范围签名', p.promptText.includes('code:1,config:1,db:1,materials:1'));
  check('复制之后仍是待接手（不是已接手）', stageOf(st) === 'awaiting_handoff', stageOf(st));

  const again = await act('build_prompt', { jobId: 'JOB-2406' });
  check(
    '同一配置再复制不会换一个包号',
    again.ok && again.reused === true && again.state.jobs['JOB-2406'].migration.package.id === pkg.id
  );
}

console.log('\n[6] 错配回执必须被拦住');
{
  const sample = await fetch(`${BASE}/api/receipt-sample?jobId=JOB-2406&kind=wrong-job`).then((r) => r.json());
  check('能取到错配示例', sample.ok === true);
  const r = await act('import_receipt', { jobId: 'JOB-2406', raw: JSON.stringify(sample.sample) });
  check('作业编号不一致 → 拒绝', r.ok === false, r.message);
  check('被拒后仍是待接手', stageOf(r.state) === 'awaiting_handoff', stageOf(r.state));
  check('拒绝被记进作业', r.state.jobs['JOB-2406'].migration.receiptsRejected.length === 1);

  const bad = await act('import_receipt', { jobId: 'JOB-2406', raw: 'not json at all' });
  check('非法 JSON → 拒绝', bad.ok === false);
}

console.log('\n[7] 匹配回执推进作业');
{
  const sample = await fetch(`${BASE}/api/receipt-sample?jobId=JOB-2406&kind=matched`).then((r) => r.json());
  const r = await act('import_receipt', { jobId: 'JOB-2406', raw: JSON.stringify(sample.sample) });
  check('匹配回执被接受', r.ok === true, r.message);
  check('阶段推进到已接手', stageOf(r.state) === 'ready', stageOf(r.state));
  check('回执写入了作业', Boolean(r.state.jobs['JOB-2406'].migration.receipt));
}

console.log('\n[8] 换目标 → 旧授权与旧回执一起失效');
{
  const before = await getState();
  const oldPkg = jobOf(before).migration.package.id;
  const r = await act('set_target', { jobId: 'JOB-2406', targetId: 'isl-01' });
  const st = r.state;
  const m = jobOf(st).migration;
  check('切到 isl-01 成功', r.ok === true);
  check('检查被清空', m.check === null);
  check('授权被清空', m.authorization === null);
  check('提示词被清空', m.package === null);
  check('回执被清空', m.receipt === null);
  check('回到待检查', stageOf(st) === 'pending_check', stageOf(st));
  check('留下了失效事件', st.log.some((e) => e.action === '旧检查与授权失效'));
  check('失效事件写清了原因', st.log.some((e) => e.action === '旧检查与授权失效' && /目标已变更/.test(e.scope)));
  check('记住上一份包编号（可用来演示旧回执）', m.previous && m.previous.packageId === oldPkg, oldPkg);
}

console.log('\n[9] 重启服务后仍然看得到发生过什么');
{
  const before = await getState();
  const logCount = before.log.length;
  server.kill();
  await new Promise((r) => setTimeout(r, 250));
  server = start();
  const ok = await waitReady();
  check('服务重启成功', ok);
  const after = await getState();
  check('阶段仍是待检查', stageOf(after) === 'pending_check', stageOf(after));
  check('事件一条没少', after.log.length === logCount, `${before.log.length} → ${after.log.length}`);
  check('事件里能找到换目标那条', after.log.some((e) => e.action === '变更迁移目标'));
  check('状态文件确实落在磁盘上', existsSync(join(STATE_DIR, 'state.json')));
}

console.log('\n[10] 旧回执在新目标下必须失效');
{
  await act('run_check', { jobId: 'JOB-2406' });
  await act('authorize', { jobId: 'JOB-2406' });
  await act('build_prompt', { jobId: 'JOB-2406' });
  const stale = await fetch(`${BASE}/api/receipt-sample?jobId=JOB-2406&kind=stale`).then((r) => r.json());
  check('能取到换目标前的旧回执', stale.ok === true);
  const r = await act('import_receipt', { jobId: 'JOB-2406', raw: JSON.stringify(stale.sample) });
  check('旧回执被拒（目标/包号对不上）', r.ok === false, r.message);
  check('仍是待接手', stageOf(r.state) === 'awaiting_handoff', stageOf(r.state));
}

server.kill();
rmSync(STATE_DIR, { recursive: true, force: true });

console.log('\n─────────────────────────────');
console.log(`通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length) {
  failures.forEach((f) => console.log('  · ' + f));
  process.exit(1);
}
console.log('端到端验收全部通过。');
