import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';

const stores = new Map();
const UNKNOWN = 'submit_outcome_unknown';
const states = new Set(['accepted_not_verified', UNKNOWN, 'rejected']);

export function createDeviceActions({ root, dir, run }) {
  const file = join(resolve(dir), 'work-device-actions.json');
  mkdirSync(resolve(dir), { recursive: true });
  const save = rows => {
    const tmp = file + '.tmp';
    const fd = openSync(tmp, 'w', 0o600);
    try { writeFileSync(fd, JSON.stringify(rows)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, file);
  };
  if (!stores.has(file)) {
    const rows = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    if (!Array.isArray(rows)) throw new Error('invalid_action_history');
    for (const row of rows) if (row.state === 'pending') row.state = UNKNOWN;
    save(rows);
    stores.set(file, rows);
  }
  const rows = stores.get(file);
  const execute = run || ((operation, body) => new Promise((resolveResult, reject) => {
    const child = spawn(process.env.PYTHON || 'python', ['-X', 'utf8', join(root, 'scripts/work-device-actions.py'), operation], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('runner_timeout')); }, 90000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('runner_failed')); });
    child.stdin.on('error', () => {});
    child.stdout.on('data', data => { output += data; if (output.length > 1048576) { child.kill(); } });
    child.on('close', code => {
      clearTimeout(timer);
      try { if (code !== 0) throw new Error(); resolveResult(JSON.parse(output)); }
      catch { reject(new Error('runner_failed')); }
    });
    child.stdin.end(body ? JSON.stringify(body) : '');
  }));
  const receipt = row => ({ ...row, state: row.state === 'pending' ? UNKNOWN : row.state });
  return {
    async catalog() {
      const result = await execute('catalog');
      if (!Array.isArray(result?.apps)) throw new Error('catalog_unavailable');
      return { apps: result.apps.map(({ id, name, fingerprint }) => ({ id, name, fingerprint })) };
    },
    history() { return rows.map(receipt); },
    async submit(body) {
      const fields = ['requestId', 'deviceId', 'appId', 'appFingerprint'];
      if (!body || fields.some(k => typeof body[k] !== 'string' || !body[k].trim() || body[k].length > 256) || !/^[a-f0-9]{64}$/.test(body.appFingerprint) || !['install', 'upgrade'].includes(body.action)) throw new Error('invalid_action_request');
      const clean = Object.fromEntries([...fields, 'action'].map(k => [k, body[k]]));
      const old = rows.find(r => r.requestId === clean.requestId);
      if (old) {
        if (['deviceId', 'appId', 'appFingerprint', 'action'].some(k => old[k] !== clean[k])) throw new Error('request_id_conflict');
        return receipt(old);
      }
      const duplicate = rows.find(r => r.deviceId === clean.deviceId && r.appFingerprint === clean.appFingerprint && r.state !== 'rejected');
      if (duplicate) return receipt(duplicate);
      const row = { ...clean, state: 'pending', createdAt: new Date().toISOString() };
      rows.push(row);
      try { save(rows); } catch (error) { rows.pop(); throw error; }
      let result;
      try { result = await execute('submit', clean); } catch { result = { state: UNKNOWN }; }
      row.state = states.has(result?.state) ? result.state : UNKNOWN;
      const messages = new Set(['app_changed', 'device_unavailable', 'work_client_upgrade_required', 'read_failed', 'invalid_action', 'upstream_rejected', UNKNOWN]);
      if (messages.has(result?.message)) row.message = result.message;
      else if (row.state === UNKNOWN) row.message = UNKNOWN;
      if (typeof result?.appName === 'string') row.appName = result.appName.slice(0, 256);
      // A persistence error cannot change a known upstream outcome or cause a retry.
      try { save(rows); } catch { row.persistenceWarning = 'receipt_persistence_failed'; }
      return receipt(row);
    },
  };
}
