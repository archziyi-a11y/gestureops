import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const services = ['AFTB-Bot', 'AFTB-Pilot-Observation', 'PXKB-Bot'];
const containers = ['pxkb-n8n', 'scs-n8n-caddy'];
const businessNames = { 'AFTB-Bot': '自动填表机器人', 'AFTB-Pilot-Observation': '自动填表试点观测服务', 'PXKB-Bot': '培训课表机器人', 'pxkb-n8n': '自动任务平台', 'scs-n8n-caddy': '自动任务平台网关' };
const labels = { running: '运行中', stopped: '已停止', starting: '启动中', other: '其他状态', error: '读取失败' };
function project(name, row) {
  const raw = row.value ?? null;
  const state = row.error ? 'error' : ['Running', 'running'].includes(raw) ? 'running' :
    ['Stopped', 'exited', 'dead'].includes(raw) ? 'stopped' :
    ['StartPending', 'ContinuePending', 'created', 'restarting'].includes(raw) ? 'starting' : 'other';
  return { name, businessName: businessNames[name], state, stateLabel: labels[state], raw, error: row.error ?? null };
}
const TIMEOUT = 10000;
const execute = (file, args, options) => new Promise((resolve, reject) => {
  execFile(file, args, options, (error, stdout) => error ? reject(error) : resolve(stdout));
});

// The deadline also covers injected readers; abort cancels native file/process reads.
async function observe(read, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    const value = await Promise.race([
      Promise.resolve().then(() => read(controller.signal)),
      new Promise((_, reject) => { timer = setTimeout(() => {
        reject(new Error('timeout'));
        controller.abort();
      }, timeoutMs); }),
    ]);
    return { value };
  } catch (error) {
    return { error: error.message === 'timeout' ? '读取超时' : '读取失败或来源不可用' };
  } finally { clearTimeout(timer); }
}

export function createInfraCardReader({ run = execute, read = readFile, now = () => new Date(), timeoutMs = TIMEOUT } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > TIMEOUT) throw new Error('Invalid timeout');
  return async function readInfraCards({ root, dir = join(root, 'data'), dockSnapshot }) {
    const command = (file, args, signal) => run(file, args, {
      cwd: root, windowsHide: true, encoding: 'utf8', timeout: timeoutMs,
      maxBuffer: 4096, signal,
    });
    const serviceRows = [];
    for (const name of services) serviceRows.push(await observe(async signal => {
      const value = String(await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `(Get-Service -Name '${name}' -ErrorAction Stop).Status.ToString()`], signal)).trim();
      if (!['Running', 'Stopped', 'StartPending', 'StopPending', 'ContinuePending', 'PausePending', 'Paused'].includes(value)) throw new Error('invalid');
      return value;
    }, timeoutMs));
    const containerRows = [];
    for (const name of containers) containerRows.push(await observe(async signal => {
      const value = String(await command('docker', ['container', 'inspect', '--format', '{{.State.Status}}', name], signal)).trim();
      if (!['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'].includes(value)) throw new Error('invalid');
      return value;
    }, timeoutMs));
    const readiness = await observe(async signal => {
      const value=String(await command('docker',['exec','pxkb-n8n','node','-e',"fetch('http://127.0.0.1:5678/healthz/readiness',{signal:AbortSignal.timeout(4000)}).then(r=>console.log(r.status)).catch(()=>process.exit(1))"],signal)).trim();
      if(!/^\d{3}$/.test(value))throw Error('invalid');
      return Number(value);
    },timeoutMs);
    const file = join(dir, 'dock-operations.json');
    const dock = await observe(async signal => {
      const data = dockSnapshot ?? JSON.parse(await read(file, { encoding: 'utf8', signal }));
      if (!Array.isArray(data.tasks)) throw new Error('invalid');
      let tasks = 0, notes = 0;
      const results = { confirmed: 0, failed: 0, partial: 0, unknown: 0 };
      for (const task of data.tasks) {
        if (!task || typeof task !== 'object') throw new Error('invalid');
        if (task.profile !== 'mkt_dock') continue;
        if (!Array.isArray(task.notes)) throw new Error('invalid');
        tasks++;
        for (const note of task.notes) {
          if (!note || !Object.hasOwn(results, note.result)) throw new Error('invalid');
          results[note.result]++;
          notes++;
        }
      }
      return { tasks, notes, results };
    }, timeoutMs);
    const summarize = (id, names, rows, source) => {
      const items = names.map((name, i) => project(name, rows[i]));
      const counts = Object.fromEntries(Object.keys(labels).map(state => [state, items.filter(item => item.state === state).length]));
      const ready = id === 'n8n' ? { state: readiness.error ? 'error' : readiness.value === 200 ? 'ready' : 'not_ready', httpStatus: readiness.value ?? null, error: readiness.error ?? null } : null;
      const errors = counts.error + (ready?.state === 'error' ? 1 : 0);
      const total = items.length + (ready ? 1 : 0);
      const status = errors === total ? 'unknown' : errors ? 'partial' : 'observed';
      const overview = Object.entries(labels).filter(([state]) => counts[state]).map(([state, label]) => `${label} ${counts[state]}`).join('、');
      const readyLabel = ready?.state === 'ready' ? '就绪检查通过' : ready?.state === 'not_ready' ? '就绪检查未通过' : '就绪检查读取失败';
      const unavailable = counts.running !== names.length;
      return { id, status, source,
        fact: `${id === 'n8n' ? '容器' : '服务'}：${overview}${ready ? `；${readyLabel}` : ''}`,
        summary: id==='n8n'?'容器状态与就绪检查分开；不代表具体任务完成。':'服务运行不代表消息收发或业务完成。',
        infra: { items, counts, readiness: ready },
        detail: names.map((name, i) => `${name}: ${rows[i].value ?? rows[i].error}`).join('；')+(id==='n8n'?`；readiness=${readiness.value??readiness.error}`:'')+'。仅本机服务或平台就绪检查；不证明任务业务完成。',
        ...(unavailable || (ready && ready.state !== 'ready') ? { issue: '后台运行或平台就绪检查需关注', severity: 'unknown' } : {}),
      };
    };
    return { observedAt: now().toISOString(), cards: [
      summarize('bots', services, serviceRows, 'Windows Get-Service / Status'),
      summarize('n8n', containers, containerRows, 'Docker container inspect / State.Status；容器内 readiness HTTP 检查'),
      { id: 'bridge', status: dock.error ? 'unknown' : 'observed', source: file,
        fact: dock.error ? `人工登记：${dock.error}` : `人工登记 ${dock.value.tasks} 项任务、${dock.value.notes} 条核对记录`,
        detail: dock.error ? '未读取到有效人工登记，不能视为零任务。' :
          `仅 mkt_dock 人工登记，未经独立核验；记录结果：确认 ${dock.value.results.confirmed}、失败 ${dock.value.results.failed}、部分 ${dock.value.results.partial}、未知 ${dock.value.results.unknown}。不是实际写入或双表完成统计。`,
        ...(dock.error ? { issue: '人工登记读取不可用', severity: 'unknown' } : {}),
      },
      { id: 'reports', status: 'unknown', fact: '执行汇总未接入',
        detail: `pxkb-n8n 容器：${containerRows[0].value ?? containerRows[0].error}；容器状态不等同于 PDDR / PXKB 日报执行结果。`,
        source: 'Docker container inspect / pxkb-n8n / State.Status；执行数据库未读取',
      },
    ] };
  };
}

export const readInfraCards = createInfraCardReader();
