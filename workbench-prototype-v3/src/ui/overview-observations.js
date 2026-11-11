import { balanceSummary } from '../domain/balance-summary.js';
import { registerObservedAssets } from '../domain/asset-catalog.js';
import { paintReminders } from './operations-reminders.js';
import { paintSalesStatus } from './sales-dashboard.js';
import { salesLiveFactsMounted } from './sales-live-facts.js';
import { cardObservationsMounted } from './card-observations.js';
import { dockDashboardMounted } from './dock-dashboard.js';
let reminders = null;

let snapshot = null;
let pending = null;
let lastRead = 0;

function paint() {
  if (!snapshot) return;
  const summary = balanceSummary(snapshot);
  const salesReminders=reminders?{...reminders,issues:reminders.issues.filter(issue=>!issue.project||issue.project==='sales')}:null;
  if (salesReminders) { paintReminders(reminders); paintSalesStatus(salesReminders); }
  document.querySelectorAll('[data-sales-balance-time]').forEach(node=>node.textContent=summary.time ? `最近查询：${new Date(summary.time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} 北京时间` : '尚无成功查询记录');
  document.querySelectorAll('.ws-project[data-asset="sales"] footer span, .ws-asset[data-asset="sales"] .ws-fact, [data-sales-balance]').forEach(node => {
    const issue = !node.matches('[data-sales-balance]') && salesReminders?.issues[0];
    const observation=reminders?.salesObservation;
    const devices=observation?.devices;
    const deviceText=devices && !observation.deviceError ? `工作机 ${devices.online}/${devices.total} 台在线` : observation?.deviceError ? '工作机状态更新失败' : '';
    node.textContent = issue ? `${issue.title}${salesReminders.issues.length > 1 ? ` · 共 ${salesReminders.issues.length} 项待处理` : ''}` : [!node.matches('[data-sales-balance]') && deviceText,summary.text].filter(Boolean).join(' · ');
    node.classList.toggle('balance-low', !!issue || summary.warning);
    node.title = summary.time ? `余额查询于 ${new Date(summary.time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 北京时间` : '';
  });
}

export function overviewObservationsMounted() {
  dockDashboardMounted();
  cardObservationsMounted();
  salesLiveFactsMounted();
  if (!document.querySelector('[data-asset="sales"], [data-sales-balance], [data-operations-reminders]')) return;
  paint();
  if (pending || Date.now() - lastRead < 15000) return;
  pending = fetch('/api/operations-reminders').then(response => {
    if (!response.ok) throw new Error('balance unavailable');
    return response.json();
  }).then(value => { reminders=value; registerObservedAssets(value.assets); snapshot = value.balance; lastRead = Date.now(); paint(); }).catch(() => {
    document.querySelectorAll('[data-operations-reminders]').forEach(node => {
      if (!reminders) node.innerHTML='<h2>需处理</h2><p>提醒暂时读取失败，请稍后重开详情。</p>';
    });
    if (snapshot) {
      snapshot = { ...snapshot, connections: { ...snapshot.connections, sales: { ...snapshot.connections?.sales, error: 'cache unavailable' } } };
      paint();
    }
    document.querySelectorAll('[data-sales-headline]').forEach(node=>node.textContent='当前状态读取失败');
    document.querySelectorAll('[data-sales-impact]').forEach(node=>node.textContent='暂时无法更新运行情况；下面如有记录，仍是上次读取的结果。');
  }).finally(() => { pending = null; });
}

setInterval(overviewObservationsMounted, 60000);
