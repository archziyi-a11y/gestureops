import { asset, contextText, addToTask } from "../domain/workspace.js";
import { createWorkspaceViews } from "./workspace-views.js";
import { createWorkspaceClient } from "./workspace-client.js";
let state,
  redraw,
  notify,
  copy,
  category = "all",
  activeCompose = null;
let dragging = [],
  client,
  scrollPosition = 0,
  shelfPosition = 0;
let preview = null,
  taskExpanded = false,
  dragEndedAt = 0;
let density = "auto",
  gridObserver;
try {
  const saved = localStorage.getItem("workbench.grid-density");
  if (["auto", "2", "3", "4"].includes(saved)) density = saved;
} catch {}

export async function initWorkspace(options) {
  ({ redraw, notify, copy } = options);
  client = createWorkspaceClient({
    onState: (value) => {
      state = value;
    },
    redraw,
    notify,
  });
  await client.load();
  // Viewing is navigation; clear persisted content from earlier prototypes.
  if (state.inspecting) await mutate({ type: "inspect" }, false);
}
function mutate(action, repaint = true) {
  return client.mutate(action, repaint);
}
function views() {
  return createWorkspaceViews({
    state,
    category,
    activeCompose,
    density,
    taskExpanded,
    preview,
  });
}
export function workspaceGrid(projects) {
  return views().workspaceGrid(projects);
}
export function workspaceDetail() {
  return views().workspaceDetail();
}
function remember() {
  scrollPosition = window.scrollY;
  shelfPosition =
    document.querySelector(".ws-shelf")?.scrollLeft || shelfPosition;
}
function inspect(id) {
  if (!asset(id)) return;
  remember();
  location.hash = `#/asset/${id}`;
}
export function workspaceMounted() {
  const inspection = document.querySelector(".ws-inspection");
  document.body.classList.toggle("ws-inspection-open", !!inspection);
  if (inspection) {
    inspection.showModal();
    let scrollTimer;
    const updateOverflow = () => inspection.classList.toggle("has-more", inspection.scrollHeight - inspection.clientHeight - inspection.scrollTop > 4);
    inspection.addEventListener("scroll", () => {
      updateOverflow();
      inspection.classList.add("is-scrolling");
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => inspection.classList.remove("is-scrolling"), 700);
    }, { passive: true });
    inspection.addEventListener("toggle", updateOverflow, true);
    requestAnimationFrame(updateOverflow);
    const close = () => {
      inspection.classList.add("is-closing");
      setTimeout(() => {
        location.hash = "#/grid";
        setTimeout(() => window.scrollTo(0, scrollPosition), 30);
      }, 180);
    };
    inspection.addEventListener("cancel", event => { event.preventDefault(); close(); });
    inspection.addEventListener("click", event => {
      if (event.target === inspection) close();
    });
    inspection.querySelector('[data-ws="return-grid"]')?.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation(); close();
    });
    window.scrollTo(0, scrollPosition);
  }
  gridObserver?.disconnect();
  const grid = document.querySelector(".ws-projects");
  if (grid) {
    const fit = () => {
      const wanted = Number(grid.dataset.columns);
      const available = Math.max(1, Math.floor((grid.clientWidth + 20) / 260));
      const count = Math.min(wanted, available);
      grid.style.gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`;
      grid.dataset.effectiveColumns = String(count);
    };
    fit();
    gridObserver = new ResizeObserver(fit);
    gridObserver.observe(grid);
  }
  const shelf = document.querySelector(".ws-shelf");
  if (shelf) shelf.scrollLeft = shelfPosition;
  const dialog = document.querySelector(".ws-dialog");
  if (dialog) {
    dialog.removeAttribute("open");
    dialog.showModal();
  }
}
function taskText() {
  return contextText(state.task, "排查本次问题与相关依赖");
}
async function copied(text) {
  const ok = await copy(text);
  notify(
    ok ? "任务上下文已复制到剪贴板" : "复制失败，请重试",
    ok ? "ok" : "error",
  );
}
document.addEventListener("click", async (ev) => {
  const project = ev.target.closest("[data-project-open]");
  if (
    project &&
    !ev.target.closest(".ws-composition") &&
    Date.now() - dragEndedAt > 300
  ) {
    const id = project.dataset.projectOpen;
    if (id.startsWith("draft-")) {
      activeCompose = id;
      redraw();
    } else location.hash = `#/p/${id}`;
    return;
  }
  const el = ev.target.closest("[data-ws]");
  if (!el || !state) return;
  ev.preventDefault();
  const a = el.dataset.ws,
    id = el.dataset.id,
    target = el.dataset.target;
  if (a === "density") {
    density = el.dataset.value;
    try {
      localStorage.setItem("workbench.grid-density", density);
    } catch {
      notify("浏览器未允许记住密度，本次选择仍有效", "warn");
    }
    redraw();
    document
      .querySelector(`[data-ws="density"][data-value="${density}"]`)
      ?.focus({ preventScroll: true });
    return;
  }
  if (a === "inspect") return inspect(id);
  if (a === "return-grid") {
    location.hash = "#/grid";
    setTimeout(() => window.scrollTo(0, scrollPosition), 30);
    return;
  }
  if (a === "toggle-task") {
    taskExpanded = !taskExpanded;
    redraw();
    return;
  }
  if (a === "add-task")
    return mutate({ type: "task-add", ids: id ? [id] : [] });
  if (a === "remove-task") return mutate({ type: "task-remove", id });
  if (a === "filter") {
    category = el.dataset.value;
    shelfPosition = 0;
    redraw();
    return;
  }
  if (a === "scroll-shelf")
    return document
      .querySelector(".ws-shelf")
      ?.scrollBy({
        left: Number(el.dataset.direction) * 360,
        behavior: "smooth",
      });
  if (a === "open-compose") {
    activeCompose = target;
    return mutate({ type: "compose", target, ids: [] });
  }
  if (a === "save-compose") {
    const panel = el.closest(".ws-composition");
    const description = panel.querySelector(
      '[data-ws-field="description"]',
    ).value;
    const name = panel.querySelector('[data-ws-field="name"]')?.value;
    el.disabled = true;
    let ok = true;
    if (target === "new")
      ok = await mutate(
        { type: "compose-edit", target, field: "name", value: name },
        false,
      );
    if (ok)
      ok = await mutate(
        {
          type: "compose-edit",
          target,
          field: "description",
          value: description,
        },
        false,
      );
    if (ok && target === "new")
      ok = await mutate({ type: "project-save" }, false);
    if (ok) {
      activeCompose = null;
      redraw();
      notify("草稿已保存", "ok");
    } else el.disabled = false;
    return;
  }
  if (a === "delete-project") {
    const draft = state.projects.find(p => p.id === target);
    if (!draft) return;
    if (!window.confirm(`删除项目草稿“${draft.name}”？\n仅删除此草稿和组装记录，不删除关联资产、代码或实际项目。此操作不可撤销。`)) return;
    el.disabled = true;
    const ok = await mutate({ type: "project-delete", target }, false);
    if (ok) {
      activeCompose = null;
      redraw();
      notify("项目草稿已删除", "ok");
    } else el.disabled = false;
    return;
  }
  if (a === "remove-compose")
    return mutate({ type: "compose-remove", target, id });
  if (a === "cancel-compose") {
    activeCompose = null;
    return mutate({ type: "compose-cancel", target });
  }
  if (a === "preview-compose") {
    await client.settled();
    const c = state.compositions[target];
    const ids = [...new Set([...(asset(target) ? [target] : []), ...c.ids])];
    preview = contextText(
      ids,
      target === "new"
        ? `筹备新项目：${c.name || "未命名"}`
        : `评估项目增量：${el.dataset.name}`,
      c.description,
    );
    redraw();
    return;
  }
  if (a === "copy-task") return copied(taskText());
  if (a === "preview-task") {
    preview = taskText();
    redraw();
    return;
  }
  if (a === "close-preview") {
    preview = null;
    redraw();
    return;
  }
  if (a === "copy-preview")
    return copied(document.getElementById("ws-preview").value);
});
document.addEventListener("input", (ev) => {
  const field = ev.target.dataset.wsField;
  if (field)
    mutate(
      {
        type: "compose-edit",
        target: ev.target.dataset.target,
        field,
        value: ev.target.value,
      },
      false,
    );
  if (ev.target.id === "ws-preview") preview = ev.target.value;
});
document.addEventListener("dragstart", (ev) => {
  const card = ev.target.closest("[data-asset]");
  if (!card) return;
  dragging = [card.dataset.asset];
  ev.dataTransfer.setData(
    "application/x-workbench-assets",
    JSON.stringify(dragging),
  );
  ev.dataTransfer.effectAllowed = "copy";
  document.body.classList.add("ws-dragging");
});
document.addEventListener("dragover", (ev) => {
  const zone = ev.target.closest("[data-drop]");
  if (!zone || !dragging.length) return;
  ev.preventDefault();
  if (zone.dataset.drop === "task") {
    try { addToTask(state.task, dragging); }
    catch {
      ev.dataTransfer.dropEffect = "none";
      zone.classList.add("ws-drop-denied");
      zone.classList.remove("ws-drag-over");
      if (zone.classList.contains("ws-edge")) zone.querySelector("span").textContent = "需单独处理";
      return;
    }
  }
  if (dragging.includes(zone.dataset.target)) {
    ev.dataTransfer.dropEffect = "none";
    zone.classList.remove("ws-drag-over");
    return;
  }
  ev.dataTransfer.dropEffect = "copy";
  document.querySelectorAll(".ws-drag-over").forEach((z) => {
    if (z !== zone) z.classList.remove("ws-drag-over");
  });
  zone.classList.add("ws-drag-over");
});
function endDrag() {
  if (dragging.length) dragEndedAt = Date.now();
  dragging = [];
  document.body.classList.remove("ws-dragging");
  document.querySelectorAll(".ws-drop-denied").forEach(z => z.classList.remove("ws-drop-denied"));
  document.querySelectorAll(".ws-edge-right > span").forEach(z => z.textContent = "加入处理");
  document
    .querySelectorAll(".ws-drag-over")
    .forEach((z) => z.classList.remove("ws-drag-over"));
}
document.addEventListener("dragend", endDrag);
document.addEventListener("dragleave", (ev) => {
  const zone = ev.target.closest("[data-drop]");
  if (!zone || (ev.relatedTarget && zone.contains(ev.relatedTarget))) return;
  zone.classList.remove("ws-drag-over", "ws-drop-denied");
  if (zone.classList.contains("ws-edge-right")) zone.querySelector("span").textContent = "加入处理";
});
document.addEventListener("drop", (ev) => {
  const zone = ev.target.closest("[data-drop]");
  if (!zone || !dragging.length) {
    endDrag();
    return;
  }
  ev.preventDefault();
  const ids = [...dragging];
  endDrag();
  if (ids.includes(zone.dataset.target)) return;
  if (zone.dataset.drop === "inspect") inspect(ids[0]);
  else if (zone.dataset.drop === "task") mutate({ type: "task-add", ids });
  else {
    activeCompose = zone.dataset.target;
    mutate({ type: "compose", target: activeCompose, ids });
  }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    endDrag();
    preview = null;
    activeCompose = null;
    if (state) redraw();
  }
});
document.addEventListener("keydown", (ev) => {
  if (!ev.target.matches?.(".ws-asset, .ops-issue")) return;
  if (ev.altKey && ev.key === "ArrowLeft") {
    ev.preventDefault();
    inspect(ev.target.dataset.asset);
  }
  if (ev.altKey && ev.key === "ArrowRight") {
    ev.preventDefault();
    mutate({
      type: "task-add",
      ids: [ev.target.dataset.asset],
    });
  }
});
document.addEventListener("keydown", (ev) => {
  if (
    (ev.key === "Enter" || ev.key === " ") &&
    ev.target.matches("[data-project-open]")
  ) {
    ev.preventDefault();
    ev.target.click();
  }
});
document.addEventListener(
  "scroll",
  (ev) => {
    if (ev.target?.classList?.contains("ws-shelf"))
      shelfPosition = ev.target.scrollLeft;
  },
  true,
);
