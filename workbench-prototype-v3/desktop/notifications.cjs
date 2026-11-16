const fs = require('node:fs');
const path = require('node:path');
const names = { jyq: '教研图片采集', images: '教研图片集', prism: 'Prism 教学平台', bots: 'Bot 与任务服务', n8n: 'n8n', bridge: '对接表 Agent', reports: '日报与汇总提醒', connections: '飞书与模型连接', geo: 'GEO 自动撰稿', portraits: '销售助手画像' };

function observations(operations, cards) {
  const rows = [];
  if (operations) {
    for (const issue of operations.issues) rows.push({ id: issue.id, active: true, severity: issue.severity, episode: issue.firstSeen, title: issue.title, href: issue.href });
    for (const issue of operations.history || []) rows.push({ id: issue.id, active: false });
  }
  if (cards) for (const card of cards.cards) {
    // These summaries duplicate the individual balance incidents above.
    if (card.id === 'bridge' && operations?.issues.some(i => i.project === 'bridge')) continue;
    if (card.id === 'connections' && operations?.issues.some(i => i.id.startsWith('incident:balance'))) continue;
    rows.push({ id: `card:${card.id}`, active: !!card.issue, severity: card.severity, title: `${names[card.id] || card.id}有待处理问题`, href: '#/grid' });
  }
  return rows;
}

function createNotifier({ file, deliver, clock = () => new Date().toISOString() }) {
  let state = { enabled: true, entries: {} };
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!state.entries || typeof state.enabled !== 'boolean') throw Error('Invalid notification state');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(state, null, 2));
    fs.renameSync(file + '.tmp', file);
  };
  return {
    enabled: () => state.enabled,
    setEnabled(value) { state.enabled = value; save(); },
    async accept(rows) {
      const fresh = [];
      for (const row of rows) {
        const old = state.entries[row.id];
        if (!row.active) { if (old) { old.active = false; old.pending = false; } continue; }
        const recurrence = !!(old?.episode && row.episode && old.episode !== row.episode);
        const escalated = row.severity === 'severe' && old?.severity !== 'severe';
        const pending = old?.pending || !old?.active || !old.notifiedAt || recurrence || escalated;
        if (state.enabled && pending) fresh.push(row);
        state.entries[row.id] = { ...old, active: true, severity: row.severity, episode: row.episode, pending: !!pending && !state.enabled, ...(fresh.includes(row) ? { notifiedAt: clock() } : {}) };
      }
      // Reserve persistently before displaying: restarting must not repeat a toast.
      save();
      if (fresh.length) await deliver(fresh);
      return fresh;
    }
  };
}
module.exports = { observations, createNotifier };
