import { mkdirSync, existsSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const stores = new Map();
const active = new Set(['running', 'preparing', 'publishing', 'dispatching', 'pending']);
const unknown = 'submit_outcome_unknown';
const clone = value => structuredClone(value);

// Records contain only selected identifiers and allowlisted outcomes, never raw receipts/errors.
export function createDeviceBatch({ dir, release, actions, readDevices }) {
  const file = join(resolve(dir), 'work-device-batch.json');
  mkdirSync(resolve(dir), { recursive: true });
  const save = rows => {
    const tmp = file + '.tmp';
    const fd = openSync(tmp, 'w', 0o600);
    try { writeFileSync(fd, JSON.stringify(rows)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, file);
  };
  if (!stores.has(file)) {
    const rows = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    if (!Array.isArray(rows)) throw new Error('invalid_batch_history');
    for (const row of rows) if (active.has(row.state)) {
      row.state = 'interrupted';
      row.message = 'restart_interrupted';
      for (const result of row.results) if (result.state === 'submitting') {
        result.state = unknown;
        result.message = unknown;
      }
    }
    save(rows);
    stores.set(file, { rows, busy: false, blocked: false });
  }
  const store = stores.get(file);
  const persist = row => {
    row.updatedAt = new Date().toISOString();
    try { save(store.rows); } catch {
      // Keep known receipts in memory, block further writes/dispatch until restart.
      store.blocked = true;
      row.state = 'stopped';
      row.message = 'batch_persistence_failed';
      throw new Error('batch_persistence_failed');
    }
  };
  const finish = (row, state, message) => {
    row.state = state;
    if (message) row.message = message;
    persist(row);
  };
  async function execute(row) {
    try {
      row.state = 'preparing';
      persist(row);
      let snapshot;
      try { snapshot = await readDevices(); } catch { finish(row, 'failed', 'device_read_failed'); return; }
      const devices = Array.isArray(snapshot) ? snapshot : snapshot?.devices;
      if (!Array.isArray(devices) || row.deviceIds.some(id => devices.filter(d => d.id === id).length !== 1)) {
        finish(row, 'failed', 'selected_device_missing'); return;
      }
      for (const result of row.results) {
        const device = devices.find(d => d.id === result.deviceId);
        if (device.upgradeBlock || device.softwareVersion === '1.0.0.703') {
          result.state = 'skipped'; result.message = 'work_client_upgrade_required';
        } else if (device.online !== true) {
          result.state = 'skipped'; result.message = 'device_offline';
        }
      }
      persist(row);
      const eligible = row.results.filter(r => r.state === 'pending');
      if (!eligible.length) { finish(row, 'completed', 'no_eligible_devices'); return; }
      row.state = 'publishing'; persist(row);
      let app;
      try {
        ({ app } = await release.publish(row.releaseId));
        if (typeof app?.id !== 'string' || !app.id || !/^[a-f0-9]{64}$/.test(app.fingerprint)) throw new Error();
      } catch { finish(row, 'failed', 'publish_failed'); return; }
      row.app = { id: app.id, fingerprint: app.fingerprint };
      row.state = 'dispatching'; persist(row);
      for (const result of eligible) {
        result.state = 'submitting'; persist(row);
        let receipt;
        try {
          receipt = await actions.submit({ requestId: row.id + '-' + result.deviceId, action: 'upgrade', appId: app.id, appFingerprint: app.fingerprint, deviceId: result.deviceId });
        } catch { receipt = { state: unknown }; }
        result.state = ['accepted_not_verified', 'rejected'].includes(receipt?.state) ? receipt.state : unknown;
        if (result.state !== 'accepted_not_verified') result.message = result.state;
        if (receipt?.persistenceWarning) {
          finish(row, 'stopped', 'receipt_persistence_failed'); return;
        }
        persist(row);
        if (result.state === unknown) { finish(row, unknown, unknown); return; }
      }
      const accepted = row.results.filter(r => r.state === 'accepted_not_verified').length;
      finish(row, accepted === row.results.length ? 'completed' : accepted ? 'partial' : 'failed');
    } catch {
      // Persistence failure has already retained the last known business outcome.
      if (!store.blocked) {
        try { finish(row, 'failed', 'batch_failed'); } catch { /* blocked by persist */ }
      }
    } finally { store.busy = false; }
  }
  return {
    start({ requestId, releaseId, deviceIds } = {}) {
      const valid = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,180}$/.test(value);
      if (!valid(requestId) || !valid(releaseId) || !Array.isArray(deviceIds) || !deviceIds.length || deviceIds.some(id => !valid(id)) || new Set(deviceIds).size !== deviceIds.length) throw new Error('invalid_batch_request');
      const old = store.rows.find(r => r.requestId === requestId);
      if (old) {
        if (old.releaseId !== releaseId || JSON.stringify([...old.deviceIds].sort()) !== JSON.stringify([...deviceIds].sort())) throw new Error('request_id_conflict');
        return clone(old);
      }
      if (store.blocked) throw new Error('batch_persistence_failed');
      if (store.busy) throw new Error('batch_in_progress');
      const row = { id: randomUUID(), requestId, releaseId, deviceIds: [...deviceIds], state: 'running', results: deviceIds.map(deviceId => ({ deviceId, state: 'pending' })), createdAt: new Date().toISOString() };
      store.rows.push(row);
      try { persist(row); } catch (error) { store.rows.pop(); throw error; }
      store.busy = true;
      queueMicrotask(() => { void execute(row); });
      return clone(row);
    },
    list() { return clone(store.rows); },
    get(id) { const row = store.rows.find(r => r.id === id); return row ? clone(row) : null; },
  };
}
