import {
  ASSETS,
  CATEGORIES,
  asset,
  cardContext,
} from "../domain/asset-catalog.js";
import { salesDashboard } from "./sales-dashboard.js";
import { prismDashboard } from "./prism-dashboard.js";
import { dockDashboard } from "./dock-dashboard.js";
const e = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const button = (action, label, attrs = "") =>
  `<button type="button" data-ws="${action}" ${attrs}>${label}</button>`;

export function createWorkspaceViews({
  state,
  category,
  activeCompose,
  density,
  taskExpanded,
  preview,
}) {
  function selectedRows(ids, action, target = "") {
    return ids
      .map((id) => {
        const a = asset(id);
        const severity = a.issue ? (a.severity === "normal" ? "一般问题" : a.severity === "severe" ? "严重问题" : "等级待确认") : "";
        const task = action === "remove-task";
        return `<li><span>${e(a.name)}${severity ? task ? `<i class="ws-task-status" title="${severity}" aria-label="${severity}"></i>` : `<small>${severity}</small>` : ""}</span>${button(action, "×", `data-id="${id}" data-target="${e(target)}" title="移除${e(a.name)}" aria-label="移除${e(a.name)}"`)}</li>`;
      })
      .join("");
  }
  function composition(target, name) {
    const c = state.compositions[target] || {
      ids: [],
      name: "",
      description: "",
    };
    const savedDraft = state.projects.some(p => p.id === target);
    return `<section class="ws-composition" role="dialog" aria-modal="false" data-drop="project" data-target="${e(target)}" aria-label="${e(name)}上下文"><header class="ws-composition-heading"><h2>${e(name)}</h2>${savedDraft ? button('delete-project', '删除草稿', `data-target="${e(target)}" class="ws-delete-draft"`) : ''}</header>
    <div class="ws-composition-assets"><h3>已加入的资产 <span>${c.ids.length}</span></h3><ul>${selectedRows(c.ids, "remove-compose", target)}</ul></div>
    ${target === "new" ? `<label>项目名称<input data-ws-field="name" data-target="new" maxlength="160" value="${e(c.name)}"></label>` : ""}
    <label>${target === "new" ? "项目描述" : "希望带来什么变化"}<textarea data-ws-field="description" data-target="${e(target)}" rows="2">${e(c.description)}</textarea></label>
    <footer>${button("save-compose", "保存草稿", `data-target="${e(target)}"`)}${button("preview-compose", "预览与复制", `data-target="${e(target)}" data-name="${e(name)}"`)}${button("cancel-compose", "取消组装", `data-target="${e(target)}"`)}</footer></section>`;
  }
  function rails() {
    return `${location.hash.startsWith("#/asset/") ? "" : '<aside class="ws-edge ws-edge-left" data-drop="inspect" aria-label="查看详情拖放区"><span>查看详情</span></aside>'}
    <aside class="ws-edge ws-edge-right" data-drop="task" aria-label="加入处理拖放区"><span>加入处理</span></aside>
    <aside class="ws-rail ws-task ${state.task.length ? "has-content" : ""} ${taskExpanded ? "is-expanded" : ""}" data-drop="task" aria-label="本次处理拖放区"><header><span>本次处理 <small>${state.task.length || ""}</small></span>${button("toggle-task", taskExpanded ? "收起" : "展开", `class="ws-mobile-toggle" aria-expanded="${taskExpanded}"`)}</header><ul>${selectedRows(state.task, "remove-task")}</ul>${state.task.length ? `${button("preview-task", "查看上下文", 'class="ws-task-preview"')}${button("copy-task", "复制处理任务", 'class="ws-primary"')}` : '<span class="ws-drop-mark">↘</span>'}</aside>`;
  }
  function workspaceGrid(projects) {
    if (!state) return "<p>正在读取工作台…</p>";
    const all = [...projects, ...state.projects];
    const columns =
      density === "auto"
        ? all.length + 1 > 9
          ? 4
          : all.length + 1 > 4
            ? 3
            : 2
        : Number(density);
    return `<div class="ws-stage"><header class="pagehead"><div><p class="eyebrow mono">WORKSPACE / OVERVIEW</p><h1 class="h1">项目总览</h1></div><div class="ws-overview-tools"><span>${projects.length} 个项目${state.projects.length ? ` · ${state.projects.length} 个草稿` : ""}</span><div class="ws-density" role="group" aria-label="总览密度">${["auto", "2", "3", "4"].map((v) => button("density", v === "auto" ? "自动" : `${v}列`, `data-value="${v}" aria-pressed="${density === v}"`)).join("")}</div></div></header>
    <section class="ws-projects" data-columns="${columns}">${all
      .map(
        (
          p,
          i,
        ) => `<article class="ws-project" data-project-open="${e(p.id)}" role="link" tabindex="0" aria-label="${e(p.name)}" data-drop="project" data-target="${e(p.id)}" ${asset(p.id) ? `draggable="true" data-asset="${p.id}"` : ""}>
      <p class="eyebrow mono">${p.id.startsWith("draft-") ? "DRAFT" : "PROJECT"} / ${String(i + 1).padStart(2, "0")}</p><h2>${e(p.name)}</h2><p class="sub">${e(p.purpose)}</p>
      <footer><span>${e(asset(p.id)?.fact || "项目草稿 · 未部署")}</span></footer>
      </article>`,
      )
      .join("")}
      <article class="ws-project ws-new" data-drop="project" data-target="new">${button("open-compose", `<span class="ws-plus">+</span><span>${state.compositions.new ? "继续新项目草稿" : "新项目"}</span>`, 'data-target="new"')}</article></section>
    ${activeCompose ? composition(activeCompose, activeCompose === "new" ? "新项目草稿" : all.find((p) => p.id === activeCompose)?.name || "项目组装") : ""}
    ${rails()}
    <section class="ws-assets"><header><h2>资产与基础设施</h2><div class="ws-shelf-controls">${button("scroll-shelf", "‹", 'data-direction="-1" aria-label="向前浏览资产"')}${button("scroll-shelf", "›", 'data-direction="1" aria-label="向后浏览资产"')}</div></header>
    <nav class="ws-filters" aria-label="资产类别">${["all", ...CATEGORIES.map((_, i) => String(i))].map((v) => button("filter", v === "all" ? "全部" : CATEGORIES[Number(v)], `data-value="${v}" aria-pressed="${category === v}"`)).join("")}</nav>
    <div class="ws-shelf">${ASSETS.map(a=>asset(a.id)).filter(
      (a) => category === "all" || String(a.category) === category,
    )
      .map(
        (a) =>
          `<article class="ws-asset" draggable="true" data-asset="${a.id}" tabindex="0" aria-label="${e(a.name)}" aria-description="Alt 加左箭头查看详情，Alt 加右箭头加入本次处理"><header><small>${CATEGORIES[a.category]}</small></header><h3>${e(a.name)}</h3><p>${e(a.summary)}</p><p class="ws-fact" ${a.id==='sales-sources'?'data-source-asset-summary':''}>${e(a.fact)}</p><p class="ws-card-context">${e(cardContext[a.id] || a.detail)}</p></article>`,
      )
      .join("")}</div>
    <p class="ws-source-note">余额来自定时查询；其他信息按各项来源与观测时间显示。</p></section></div>${location.hash.startsWith('#/asset/') ? '' : previewDialog()}`;
  }
  function workspaceDetail() {
    const a = asset(decodeURIComponent(location.hash.split("/")[2] || ""));
    if (!a) return '<p>对象不存在。<a href="#/grid">返回总览</a></p>';
    const live = ['geo','prism','jyq','images','bots','n8n','reports','connections','deploy','portraits'].includes(a.id);
    const special = {
      sales: salesDashboard,
      prism: prismDashboard,
      bridge: dockDashboard,
      'sales-sources':()=>'<section class="ws-detail-facts"><div data-source-asset-details><p data-source-asset-summary>正在读取源文件统计…</p></div><a href="#/p/sales/w/sources">管理源文件 →</a></section>',
    }[a.id];
    return `<section class="ws-detail"><div class="ws-inspection-toolbar"><button data-ws="return-grid" aria-label="关闭详情" title="关闭详情">×</button></div><header class="pagehead"><div><p class="eyebrow">${CATEGORIES[a.category]}</p><h1>${e(a.name)}</h1><p class="sub">${e(a.summary)}</p></div>${button("add-task", a.issue ? "加入本次处理" : "加入上下文", `data-id="${a.id}"`)}</header>
    ${live ? `<section class="ws-detail-facts" data-live-card="${a.id}"><h2>正在读取当前观测…</h2></section>` : special ? special() : `<section class="ws-detail-facts"><h2>${e(a.fact)}</h2><p>${e(a.detail)}</p><dl><dt>证据范围</dt><dd>历史调查 / 代码索引，不是实时健康检查</dd><dt>观测时间</dt><dd>${a.source.includes("20261107") ? "2026-11-07 调查，本机时钟，Asia/Shanghai；具体事件时间见记录" : "当前运行情况未核验"}</dd><dt>下一步</dt><dd>${a.issue ? "定位失败原因，确认影响与可恢复性；尚未执行重试" : "核对当前可用性、消费方与适用范围"}</dd></dl></section>`}
    ${live && special ? `<details><summary>历史调查与观察范围</summary>${special()}</details>`:''}
    <details class="ws-source"><summary>来源与接手索引</summary><p>${e(a.source)}</p><p>从项目 AGENTS.md 与来源文档开始；按本次目标查阅相关代码、部署资料和运行记录。</p></details></section>${rails()}${previewDialog()}`;
  }
  function previewDialog() {
    return preview === null
      ? ""
      : `<dialog class="ws-dialog" open aria-label="任务上下文"><header><h2>任务上下文</h2>${button("close-preview", "×", 'aria-label="关闭预览"')}</header><label>可编辑<textarea id="ws-preview" rows="17">${e(preview)}</textarea></label><footer>${button("copy-preview", "复制处理任务", 'class="ws-primary"')}</footer></dialog>`;
  }

  return { workspaceGrid, workspaceDetail };
}
