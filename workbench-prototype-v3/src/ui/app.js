import { createMigrationViews } from "./migration-views.js";
import { recoveryView } from "./recovery.js";
import { initSalesOperations, salesConsole, salesWorkface } from "./sales-operations.js";
import { deviceWorkfaceMounted } from './device-workface.js';
import { modelConnectionsMounted } from './model-connections.js';
import { knowledgeMounted } from './knowledge-workface.js';
import { sourceMounted, sourceAssetMounted } from './source-library.js';
import { overviewObservationsMounted } from './overview-observations.js';
import { jobRecordsMounted } from './job-records.js';
import { materialsMounted } from './team-materials.js';
import { initPrismOperations, prismConsole, prismWorkface } from "./prism-operations.js";
import { initDockOperations, dockConsole, dockWorkface } from "./dock-operations.js";
import { initDockManagement, dockManagementMounted } from './dock-management.js';
import { initDockRuntime, dockRuntimeMounted } from './dock-runtime.js';
import { initPrismBatch, prismBatchMounted } from './prism-batch.js';
import { prismCollectionMounted } from './prism-collection.js';
// 界面只做两件事：把服务端的事实画出来，把点击变成一次服务端动作。
// 没有任何本地状态机；刷新后看到的仍然一样，因为状态不在浏览器里。
import { salesDashboard } from "./sales-dashboard.js";
import { prismDashboard } from "./prism-dashboard.js";
import { dockDashboard } from "./dock-dashboard.js";
import {
  initWorkspace,
  workspaceGrid,
  workspaceDetail,
  workspaceMounted,
} from "./workspace.js";
const appEl = document.getElementById("app");
const toastEl = document.getElementById("toast");

const TZ = "Asia/Shanghai";
const JOB_ID = "JOB-2406";

const ICONS = {
  ok: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.4l3 3 6.6-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  danger:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  warn: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.4l6 11H2l6-11z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.6v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  unknown:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6.4 6.3a1.7 1.7 0 113 1.1c-.5.5-1.4.7-1.4 1.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  neutral:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/></svg>',
  arrow:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.6 4.4L12.4 8l-3.8 3.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 5.5V4a1.5 1.5 0 00-1.5-1.5H4A1.5 1.5 0 002.5 4v5A1.5 1.5 0 004 10.5h1.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  left: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.6 3.6L5.2 8l4.4 4.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.4 3.6L10.8 8l-4.4 4.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  grid: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="4.6" height="4.6" rx="1" fill="currentColor" opacity=".9"/><rect x="8.9" y="2.5" width="4.6" height="4.6" rx="1" fill="currentColor" opacity=".55"/><rect x="2.5" y="8.9" width="4.6" height="4.6" rx="1" fill="currentColor" opacity=".55"/><rect x="8.9" y="8.9" width="4.6" height="4.6" rx="1" fill="currentColor" opacity=".3"/></svg>',
};

const TONE_BY_STATE = {
  ok: "ok",
  partial: "warn",
  failed: "danger",
  unknown: "unknown",
  neutral: "neutral",
};

let STATE = null;
let draftReceipt = "";
let inline = null; // {level, message}

// ---------- 小工具 ----------
const esc = (v) =>
  String(v == null ? "" : v).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

function fmtTime(ms) {
  if (!ms) return "—";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function fmtClock(ms) {
  if (!ms) return "—";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function chip(label, tone = "neutral") {
  return `<span class="chip chip--${tone}">${ICONS[tone] || ICONS.neutral}<span>${esc(label)}</span></span>`;
}

function stateChip(result) {
  const map = {
    ok: "成功",
    partial: "部分成功",
    failed: "失败",
    unknown: "未观测",
  };
  return chip(map[result] || result, TONE_BY_STATE[result] || "neutral");
}

function toast(message, level = "ok") {
  if (!message) return;
  toastEl.className = `toast toast--${level}`;
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toastEl.hidden = true;
  }, 5200);
}

async function api(path, options) {
  const res = await fetch(path, options);
  const json = await res
    .json()
    .catch(() => ({ ok: false, message: "服务端返回了无法解析的内容。" }));
  if (json.state) STATE = json.state;
  return json;
}

async function call(type, payload = {}) {
  const json = await api("/api/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, ...payload }),
  });
  const silent = type === "set_project" && json.ok;
  inline = silent
    ? null
    : {
        level: json.level || (json.ok ? "ok" : "error"),
        message: json.message,
      };
  if (silent) toastEl.hidden = true;
  else toast(json.message, json.level || (json.ok ? "ok" : "error"));
  render();
  return json;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

// ---------- 路由 ----------
function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const parts = raw.split("/").filter(Boolean);
  if (!parts.length) return { name: "dashboard" };
  if (parts[0] === "grid") return { name: "grid" };
  if (parts[0] === "asset") return { name: "asset" };
  if (parts[0] === "records") return { name: "records" };
  if (parts[0] === "p" && parts[1]) {
    const projectId = parts[1];
    if (parts[2] === "migrate") return { name: "migrate", projectId };
    if (parts[2] === "migrate-demo") return { name: "migrate-demo", projectId };
    if (parts[2] === "handoff") return { name: "handoff", projectId };
    if (parts[2] === "w" && parts[3])
      return { name: "workface", projectId, face: parts[3] };
    return { name: "console", projectId };
  }
  return { name: "dashboard" };
}

// ---------- 公共片段 ----------
function topbar() {
  const r = parseHash();
  const navItem = (href, label, match) =>
    `<a class="nav__item${match ? " is-active" : ""}" href="${href}">${label}</a>`;
  return `
    <header class="topbar">
      <div class="brand">
        <span class="brand__mark">${ICONS.grid}</span>
        <span class="brand__name">屹立工作台</span>
        <span class="brand__ver mono">V3</span>
      </div>
      <nav class="nav">
        ${navItem("#/grid", "总览", r.name === "grid")}
        ${navItem("#/records", "作业记录", r.name === "records")}
      </nav>
      <div class="meta">
        ${chip("本机工作台", "neutral")}
        <span class="mono meta__time">工作区记录 ${fmtTime(STATE.updatedAt)} · Asia/Shanghai</span>
      </div>
    </header>`;
}

function inlineNote() {
  if (!inline) return "";
  return `<div class="note note--${inline.level}">${esc(inline.message)}</div>`;
}

function page(inner) {
  return `<div class="shell">${topbar()}<main class="main">${inner}</main>${footer()}</div>`;
}

function footer() {
  if (location.hash === '#/p/sales/w/runtime') return '';
  if (location.hash === '#/p/sales/w/knowledge') return '<footer class="foot"><span class="mono">本地知识版本库</span></footer>';
  if (location.hash === '#/p/sales/w/materials') return '<footer class="foot"><span class="mono">销售助手团队共享库</span></footer>';
  if (location.hash === '#/p/sales/w/devices') return '';
  if (location.hash === '#/p/sales/migrate') return '<footer class="foot"><span class="mono">迁移任务准备 · 尚未执行服务器操作</span></footer>';
  return `
    <footer class="foot">
      <span class="mono">本机工作台</span>
      ${location.hash === '#/sim' ? '<span class="mono"><button class="linkbtn" data-call="reset">重置迁移演练</button></span>' : ''}
    </footer>`;
}

// ---------- 仪表盘 ----------
function primaryObservation(id) {
  const items =
    STATE.derived.projects.find((p) => p.id === id)?.attention || [];
  return (
    items.find((a) => a.tone === "danger") ||
    items.find((a) => a.tone === "warn") ||
    items[0]
  );
}

function observationChip(item) {
  return item ? chip(item.label, item.tone) : "";
}

function viewDashboard() {
  const projects = STATE.projects;
  const i = Math.max(
    0,
    projects.findIndex((p) => p.id === STATE.activeProjectId),
  );
  const p = projects[i];
  const flip = (delta) => {
    const other = projects[(i + delta + projects.length) % projects.length];
    return `<button class="switch__btn" data-call="set_project" data-project-id="${esc(other.id)}" aria-label="切到${esc(other.name)}">${delta < 0 ? ICONS.left : ICONS.right}</button>`;
  };
  return page(`${inlineNote()}<section class="watch-panel">
    <header class="identity"><div><p class="eyebrow mono">OBSERVE / 项目巡视</p><h1 class="h1">${esc(p.name)}</h1><p class="sub">${esc(p.purpose)}</p></div>
    </header>
    ${
      p.id === "sales"
        ? salesDashboard()
        : p.id === "prism"
          ? prismDashboard()
          : p.id === "bridge"
            ? dockDashboard()
            : `
    <div class="facts"><article class="card card--fact"><header class="card__head"><h2 class="h3">服务状态</h2>${chip(p.service.state === "online" ? "在线" : "离线", p.service.state === "online" ? "ok" : "danger")}</header>
    <p class="big">${esc(p.service.endpoints)}</p><p class="sub">${esc(p.service.detail)}</p><p class="mono small">观测 ${fmtTime(p.service.checkedAt)}</p></article>
    <article class="card card--fact"><header class="card__head"><h2 class="h3">最近业务产出</h2>${chip(p.output.state === "ok" ? "有产出" : p.output.state === "unknown" ? "未知" : "异常", p.output.state === "ok" ? "ok" : "unknown")}</header>
    <p class="big">${esc(p.output.value)}</p><p class="sub">${esc(p.output.detail)}</p><p class="mono small">${p.output.at ? fmtTime(p.output.at) : "没有可用的产出事件"}</p></article></div>
    ${primaryObservation(p.id) ? `<p class="notice">${observationChip(primaryObservation(p.id))} ${esc(primaryObservation(p.id).detail)}</p>` : ""}`
    }
    </section>
    <nav class="watch-navigation" aria-label="仪表盘切换"><div class="switch">${flip(-1)}<span class="switch__label mono">${i + 1} / ${projects.length}</span>${flip(1)}</div></nav>
    ${
      !["sales", "prism", "bridge"].includes(p.id)
        ? `
    <details class="watch-details"><summary>业务产出记录</summary><table class="table"><thead><tr><th>时间</th><th>事项</th><th>结果</th><th>来源</th></tr></thead><tbody>${p.outputRows.map((r) => `<tr><td>${r.at ? fmtClock(r.at) : "—"}</td><td>${esc(r.item)}</td><td>${stateChip(r.result)} ${esc(r.detail || "")}</td><td>${esc(r.source)}</td></tr>`).join("")}</tbody></table></details>`
        : ""
    }`);
}

function viewGrid() {
  return page(workspaceGrid(STATE.projects));
}

function viewConsole(projectId) {
  if (projectId === "bridge") return page(dockConsole());
  if (projectId === "prism") return page(prismConsole());
  if (projectId === "sales") return page(salesConsole());
  const p = STATE.projects.find((x) => x.id === projectId);
  if (!p) return page("<p>项目不存在。</p>");
  const item = primaryObservation(p.id);
  const owner = p.workfaces.find(
    (f) =>
      item &&
      (item.href === "#/p/" + p.id + "/" + f.id || item.workfaceId === f.id),
  );
  return page(`${inlineNote()}<nav class="crumbs mono"><a href="#/grid">项目总览</a><span>/</span>${esc(p.name)}</nav><header class="pagehead"><div><p class="eyebrow mono">WORKSPACE / 操作台</p><h1 class="h1">${esc(p.name)}</h1></div></header>
    ${item && !owner ? `<p>${observationChip(item)} ${esc(item.detail)}</p>` : ""}
    <section class="work-surfaces">${
      p.workfaces
        .map((f, i) => {
          const linked = owner === f;
          const href =
            f.href ||
            "#/p/" +
              p.id +
              "/" +
              (f.id === "migrate" ? "migrate" : "w/" + f.id);
          return `<a class="surface face" href="${esc(href)}"><span class="eyebrow mono">0${i + 1}</span><span class="face__name">${esc(f.label)}</span>
      ${linked ? observationChip(item) : ""}<span class="surface-foot">${f.live ? "打开" : "未接入 · 查看现状"} ${ICONS.arrow}</span></a>`;
        })
        .join("") || '<p class="sub">暂无已接入工作面。</p>'
    }</section>`);
}

// ---------- 迁移准备 ----------
function migrationViews() {
  return createMigrationViews({
    STATE,
    draftReceipt,
    page,
    inlineNote,
    esc,
    chip,
    fmtTime,
    ICONS,
  });
}
function viewMigrate(projectId) {
  return migrationViews().viewMigrate(projectId);
}
function viewHandoff(projectId, embedded = false) {
  return migrationViews().viewHandoff(projectId, embedded);
}

// ---------- 未接入的工作面 ----------
function viewWorkface(projectId, faceId) {
  if (projectId === "bridge") return page(dockWorkface(faceId));
  if (projectId === "prism") return page(prismWorkface(faceId));
  if (projectId === "sales") return page(salesWorkface(faceId));
  const p = STATE.projects.find((x) => x.id === projectId);
  const face = p && p.workfaces.find((f) => f.id === faceId);
  const incident = STATE.derived.projects
    .find((x) => x.id === projectId)
    ?.attention.find((a) => a.workfaceId === faceId);
  return page(`
    <nav class="crumbs mono"><a href="#/">工作台</a><span>/</span><a href="#/p/${projectId}">${esc(p ? p.name : projectId)}</a><span>/</span><span>${esc(face ? face.label : faceId)}</span></nav>
    <section class="pagehead">
      <div>
        <p class="eyebrow mono">NOT CONNECTED · 未接入</p>
        <h1 class="h2">${esc(face ? face.label : "这个工作面")}</h1>
        ${incident ? observationChip(incident) : ""}
        <p class="sub">${esc(incident?.detail || face?.detail || "未接入")}</p>
      </div>
    </section>
    <div class="actions">
      <a class="btn btn--ghost" href="#/p/${projectId}">回到操作台</a>
    </div>
  `);
}

// ---------- 记录 ----------
function viewRecords() {
  const log = STATE.log || [];
  const rows = log
    .map(
      (e) => `
      <tr>
        <td class="mono dim">${fmtTime(e.at)}</td>
        <td><strong>${esc(e.action)}</strong></td>
        <td>${esc(e.target || "—")}</td>
        <td class="mono dim">${esc(e.before || "—")}</td>
        <td class="mono">${esc(e.after || "—")}</td>
        <td class="dim small">${esc(e.source || "—")}</td>
        <td class="dim small">${esc(e.next || "—")}</td>
        <td class="dim small">${esc(e.actor || "—")}</td>
      </tr>`,
    )
    .join("");

  return page(`
    <section class="pagehead">
      <div>
        <p class="eyebrow mono">RECORDS · 作业记录</p>
        <h1 class="h2">发生过什么</h1>
        <p class="sub">维护操作与工作机回执 · 北京时间</p>
      </div>
    </section>
    <section data-job-records aria-live="polite">正在读取维护记录…</section>
    <details><summary>历史模拟演练 · ${log.length} 条</summary>
    ${
      log.length
        ? `<div class="tablewrap"><table class="table table--log">
             <thead><tr><th>时间</th><th>动作</th><th>对象</th><th>之前</th><th>之后</th><th>来源</th><th>下一步</th><th>谁</th></tr></thead>
             <tbody>${rows}</tbody>
           </table></div>`
        : `<div class="empty">暂无模拟演练记录。</div>`
    }
    </details>
  `);
}

// ---------- 渲染 ----------
function render() {
  if (!STATE) return;
  const r = parseHash();
  let html = "";
  if (r.name === "dashboard") html = viewGrid();
  else if (r.name === "grid") html = viewGrid();
  else if (r.name === "asset") html = page(`${workspaceGrid(STATE.projects)}<dialog class="ws-inspection" aria-label="详情仪表盘">${workspaceDetail()}</dialog>`);
  else if (r.name === "records") html = viewRecords();
  else if (r.name === "console") html = viewConsole(r.projectId);
  else if (r.name === "migrate") html = r.projectId === "sales" ? page(recoveryView({ notify: toast })) : viewMigrate(r.projectId);
  else if (r.name === "migrate-demo") html = viewMigrate(r.projectId);
  else if (r.name === "handoff") html = viewHandoff(r.projectId);
  else if (r.name === "workface") html = viewWorkface(r.projectId, r.face);
  appEl.innerHTML = html;
  workspaceMounted();
  deviceWorkfaceMounted();
  modelConnectionsMounted();
  knowledgeMounted();
  sourceMounted();
  sourceAssetMounted();
  overviewObservationsMounted();
  jobRecordsMounted();
  materialsMounted();
  dockManagementMounted();
  dockRuntimeMounted();
  prismBatchMounted();
  prismCollectionMounted();
}

async function boot() {
  const json = await api("/api/state");
  if (!json.state) {
    appEl.innerHTML = `<div class="empty">读不到状态：${esc(json.message || "未知错误")}</div>`;
    return;
  }
  STATE = json.state;
  initDockManagement({notify:toast});
  initDockRuntime({notify:toast});
  initPrismBatch({notify:toast});
  try { await initDockOperations({redraw:render,notify:toast,copy:copyText}); }
  catch(err) { toast(err.message,"error"); }
  try { await initPrismOperations({redraw:render,notify:toast,copy:copyText}); }
  catch(err) { toast(err.message,"error"); }
  try {
    await initSalesOperations({redraw: render, notify: toast, copy: copyText});
  } catch (err) { toast(err.message, "error"); }
  try {
    await initWorkspace({ redraw: render, notify: toast, copy: copyText });
  } catch (err) {
    toast(err.message, "error");
  }
  render();
}

// ---------- 交互 ----------
document.addEventListener("click", async (ev) => {
  const sampleBtn = ev.target.closest("[data-sample]");
  if (sampleBtn) {
    const kind = sampleBtn.dataset.sample;
    const jobId =
      (parseHash().projectId &&
        STATE.projects.find((p) => p.id === parseHash().projectId)?.jobId) ||
      JOB_ID;
    const json = await api(
      `/api/receipt-sample?jobId=${encodeURIComponent(jobId)}&kind=${kind}`,
    );
    if (json.ok) {
      draftReceipt = JSON.stringify(json.sample, null, 2);
      const ta = document.getElementById("receipt");
      if (ta) ta.value = draftReceipt;
      toast("已载入示例回执，还需要点一次「导入回执」。", "info");
    } else {
      toast(json.message, "error");
    }
    return;
  }

  const el = ev.target.closest("[data-call]");
  if (!el) return;
  const type = el.dataset.call;
  ev.preventDefault();

  if (type === "reset") {
    if (!confirm("把演示状态恢复到初始？（会清空所有事件记录）")) return;
    const json = await api("/api/reset", { method: "POST" });
    if (json.state) STATE = json.state;
    inline = { level: "ok", message: "已回到初始状态。" };
    draftReceipt = "";
    location.hash = "#/";
    render();
    toast("已回到初始状态。", "ok");
    return;
  }

  if (type === "copy_prompt") {
    const job = STATE.jobs[el.dataset.job || JOB_ID];
    const text = job ? STATE.derived.jobs[job.id].promptText : "";
    const ok = await copyText(text || "");
    toast(
      ok
        ? "提示词已复制到剪贴板。"
        : "复制被浏览器拦住了，可以在提示词框里手动选中复制。",
      ok ? "ok" : "warn",
    );
    return;
  }

  if (type === "import_receipt") {
    const ta = document.getElementById("receipt");
    const raw = ta ? ta.value : draftReceipt;
    if (!raw || !raw.trim()) {
      toast("先贴一份回执，或者点上面的示例载入。", "warn");
      return;
    }
    await call("import_receipt", { jobId: el.dataset.job || JOB_ID, raw });
    return;
  }

  // data-* 的属性名和接口字段不是一一对应的，这里显式映射，避免把 job 当成 jobId 传空。
  const FIELD = {
    job: "jobId",
    target: "targetId",
    refId: "refId",
    key: "key",
    value: "value",
    projectId: "projectId",
  };
  const payload = {};
  for (const [k, v] of Object.entries(el.dataset)) {
    if (k === "call") continue;
    payload[FIELD[k] || k] = v;
  }

  if (type === "build_prompt") {
    const json = await call(type, payload);
    if (json.ok && json.promptText) {
      const copied = await copyText(json.promptText);
      render();
      toast(
        copied
          ? "提示词已复制。作业仍是待接手——复制不是派发。"
          : "提示词已生成，但浏览器没让复制；在下面这段文字里手动复制。作业仍是待接手。",
        copied ? "ok" : "warn",
      );
    }
    return;
  }

  await call(type, payload);
});

document.addEventListener("input", (ev) => {
  if (ev.target && ev.target.id === "receipt") draftReceipt = ev.target.value;
});

window.addEventListener("hashchange", () => {
  inline = null;
  render();
  window.scrollTo({ top: 0 });
});

boot();
