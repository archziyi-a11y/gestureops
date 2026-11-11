import { createHash } from 'node:crypto';

// Recheck observations, never replay a failed business mutation.
export function createSalesOverviewRefresh({reminders, readDevices, readMaterials, readModel, balanceMonitor, now = () => Date.now()}) {
  let pending, completedAt = -Infinity, devices = null, deviceError = false;
  const issueId = (action, target) => `incident:model:${action}:${createHash('sha256').update(`${target}:`).digest('hex').slice(0,16)}`;
  async function refresh() {
    if (pending) return pending;
    if (now() - completedAt < 60000) return snapshot();
    pending = (async () => {
      const issues = reminders.snapshot().issues;
      const jobs = [reminders.run({area:'devices',action:'inventory'}, async () => {
        const value = await readDevices();
        if (!Array.isArray(value.devices)) throw Error('Invalid inventory');
        devices = {total:value.devices.length, online:value.devices.filter(d=>d.online===true).length, observedAt:value.observedAt || new Date(now()).toISOString()};
        deviceError = false;
        return value;
      }).catch(() => { deviceError = true; })];
      if (issues.some(i=>i.id.startsWith('incident:materials:list:'))) {
        jobs.push(reminders.run({area:'materials',action:'list'}, readMaterials));
      }
      for (const target of ['sales','knowledge']) {
        for (const action of ['read','test']) {
          if (issues.some(i=>i.id===issueId(action,target))) jobs.push(reminders.run({area:'model',action,target},()=>readModel({action,target})));
        }
        const balance = balanceMonitor.snapshot();
        const row = balance.connections[target];
        const age = now() - Date.parse(row?.lastAttemptAt || '');
        if (!row || !Number.isFinite(age) || age >= (row.error ? 60000 : balance.intervalMinutes*60000)) jobs.push(balanceMonitor.check(target));
      }
      await Promise.allSettled(jobs);
      completedAt = now();
      return snapshot();
    })().finally(() => { pending = null; });
    return pending;
  }
  function snapshot() { return {devices:devices && {...devices}, deviceError}; }
  return {refresh};
}
