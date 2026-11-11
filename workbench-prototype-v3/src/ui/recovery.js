import { initialMigration, migrationErrors, migrationTask } from './migration-task.js';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let draft = initialMigration(), inspection = null, initialized = false, notify;
let errors = {}, preview = '', feedback = '';
export function recoveryView(options = {}) {
  notify = options.notify;
  if (!document.getElementById('recovery-style')) {
    const link = document.createElement('link');
    link.id = 'recovery-style'; link.rel = 'stylesheet';
    link.href = new URL('./styles/recovery.css', import.meta.url).href;
    document.head.append(link);
  }
  if (!initialized) {
    initialized = true;
    // Evidence enriches the handoff; it does not gate the initial investigation.
    fetch('/api/recovery-package').then(r => r.ok ? r.json() : null).then(value => { inspection = value; }).catch(() => {});
    document.addEventListener('input', e => {
      if (!e.target.matches('#migration-form [name]')) return;
      draft[e.target.name] = e.target.value;
      preview = ''; feedback = '';
      document.getElementById('migration-preview')?.remove();
      const status = document.getElementById('migration-feedback');
      if (status) status.textContent = '';
    });
    document.addEventListener('change', e => { if (e.target.matches('#migration-form select')) redraw(); });
    document.addEventListener('submit', async e => {
      if (e.target.id !== 'migration-form') return;
      e.preventDefault(); errors = migrationErrors(draft);
      if (Object.keys(errors).length) {
        redraw(); document.querySelector('#migration-form [aria-invalid="true"]')?.focus(); return;
      }
      preview = migrationTask(draft, inspection);
      try { await navigator.clipboard.writeText(preview); feedback = '迁移任务已复制到剪贴板'; notify?.(feedback, 'ok'); }
      catch { feedback = '复制失败，请展开任务上下文手动复制'; }
      redraw();
    });
  }
  return `<div id="recovery-page">${body()}</div>`;
}
function redraw() {
  const el = document.getElementById('recovery-page');
  if (!el) return;
  const open = [...el.querySelectorAll('details[open]')].map(d => d.querySelector('summary')?.textContent);
  const focused = el.contains(document.activeElement) ? document.activeElement.name : null;
  el.innerHTML = body();
  for (const d of el.querySelectorAll('details')) if (open.includes(d.querySelector('summary')?.textContent)) d.open = true;
  if (focused) el.querySelector(`[name="${focused}"]`)?.focus();
}
function input(label, name, extra = '') {
  return `<label>${label}<input name="${name}" value="${esc(draft[name])}" ${extra} ${errors[name] ? `aria-invalid="true" aria-describedby="error-${name}"` : ''}>${errors[name] ? `<span class="migration-error" id="error-${name}">${errors[name]}</span>` : ''}</label>`;
}
function select(name, options) { return `<select name="${name}">${options.map(([value,label])=>`<option value="${value}" ${draft[name]===value?'selected':''}>${label}</option>`).join('')}</select>`; }
function body() {
  return `<div class="sales-ops migration-workface"><nav class="crumbs"><a href="#/p/sales">销售助手</a><span>/</span>部署与迁移</nav>
  <header class="pagehead"><h1 class="h1">部署与迁移</h1></header>
  <form id="migration-form" novalidate><div class="migration-layout"><section><h2>迁到哪里</h2>
  ${input('服务器地址', 'host', 'placeholder="IP 地址或域名" autocomplete="off" maxlength="253" required')}
  <div class="migration-login">${input('登录账号', 'user', 'placeholder="例如 admin" autocomplete="off" maxlength="64" required')}${input('SSH 端口', 'port', 'type="number" min="1" max="65535" required')}</div>
  <label>认证方式${select('auth',[['key','本地私钥'],['connection','已有连接 / 云端登录']])}</label>
  ${input(draft.auth === 'key' ? '私钥路径（可接手时提供）' : '连接名称（可接手时提供）', 'credential', `placeholder="${draft.auth === 'key' ? '本机 .pem 文件路径，不粘贴内容' : '已有 SSH 配置名或云端连接'}" maxlength="500" autocomplete="off"`)}
  <details class="migration-notes" ${errors.note?'open':''}><summary>补充环境说明</summary><label>备注<textarea name="note" rows="3" maxlength="2000" placeholder="例如：这台服务器还运行着其他业务" ${errors.note?'aria-invalid="true"':''}>${esc(draft.note)}</textarea></label>${errors.note ? `<p class="migration-error">${errors.note}</p>` : ''}</details>
  </section><aside class="migration-arrangements"><h2>现有业务照常使用</h2>
  <div class="migration-promise"><h3>先部署，再切换</h3><p>${draft.downtime === 'confirm' ? '旧服务继续运行。需要停机时，再确认具体时间。' : '先准备新环境，维护窗口的开始时间与时长另行确认。'}</p></div>
  <div class="migration-promise"><h3>资料和工作机一起验收</h3><p>团队物料、已有资料与工作机访问，都纳入迁移后的验证。</p></div>
  <div class="migration-promise"><h3>${draft.access === 'keep' ? '尽量不改变同事的使用方式' : '规划新的访问地址'}</h3><p>${draft.access === 'keep' ? '优先沿用原地址；需要同事调整时，先说明影响。' : '新地址及工作机调整方案，确认后再切换。'}</p></div>
  <p class="sub">新服务器上的已有服务不直接覆盖，旧部署不自动删除。</p>
  <details><summary>调整迁移安排</summary><label>访问方式${select('access',[['keep','优先保留原地址'],['new','可以使用新地址']])}</label><label>停机安排${select('downtime',[['confirm','确需停机时再确认'],['window','可以安排维护窗口']])}</label></details>
  </aside></div><div class="migration-submit"><button class="btn btn--primary" type="submit">复制迁移任务</button><span class="sub">交给智能体核实环境，准备迁移</span></div><p id="migration-feedback" role="status">${esc(feedback)}</p></form>
  ${preview ? `<details id="migration-preview"><summary>任务上下文</summary><pre>${esc(preview)}</pre></details>` : ''}</div>`;
}
