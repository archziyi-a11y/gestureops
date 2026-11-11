import { asset, CATEGORIES } from "./asset-catalog.js";
import {maintenanceContext,maintenanceCloseout} from './maintenance-context.js';
export { ASSETS, CATEGORIES, asset } from "./asset-catalog.js";

export const initialWorkspace = () => ({
  version: 0,
  inspecting: null,
  task: [],
  projects: [],
  compositions: {},
});

// Unknown-severity incidents are isolated until their impact has been assessed.
export function addToTask(current, ids, lookup = asset) {
  const next = [...new Set([...current, ...ids])];
  if (next.some((id) => !lookup(id))) throw new Error("对象不存在");
  const issues = next.map(lookup).filter((a) => a.issue);
  if (issues.length > 1 && issues.some((a) => a.severity !== "normal"))
    throw new Error("严重或等级待确认的问题需单独处理；已有选择已保留。");
  return next;
}

export function workspaceAction(state, action) {
  const s = structuredClone(state);
  const ids = action.ids || [];
  if (Array.isArray(ids) && ids.some(id=>asset(id)?.retired)) throw new Error('资产已退役，不能加入新任务');
  if (!Array.isArray(ids) || ids.some((id) => !asset(id)))
    throw new Error("对象不存在");
  if (action.type === "inspect") s.inspecting = ids[0] || null;
  else if (action.type === "task-add") s.task = addToTask(s.task, ids);
  else if (action.type === "task-remove")
    s.task = s.task.filter((id) => id !== action.id);
  else if (action.type === "task-clear") s.task = [];
  else if (action.type === "compose") {
    if (ids.includes(action.target))
      throw new Error("不能将项目加入自身");
    if (
      ![
        "sales",
        "prism",
        "bridge",
        "new",
        ...s.projects.map((p) => p.id),
      ].includes(action.target)
    )
      throw new Error("项目不存在");
    const old = s.compositions[action.target] || {
      ids: [],
      name: "",
      description: "",
    };
    s.compositions[action.target] = {
      ...old,
      ids: [...new Set([...old.ids, ...ids])],
    };
  } else if (action.type === "compose-edit") {
    const c = s.compositions[action.target];
    if (!c) throw new Error("草稿不存在");
    if (action.field === "name" || action.field === "description")
      c[action.field] = String(action.value || "").slice(0, 4000);
    else throw new Error("未知字段");
  } else if (action.type === "compose-remove") {
    const c = s.compositions[action.target];
    if (c) c.ids = c.ids.filter((id) => id !== action.id);
  } else if (action.type === "compose-cancel")
    delete s.compositions[action.target];
  else if (action.type === "project-save") {
    const c = s.compositions.new;
    if (!c?.name.trim()) throw new Error("请填写项目名称");
    const id = `draft-${s.version + 1}`;
    s.projects.push({ id, name: c.name.trim(), purpose: c.description });
    s.compositions[id] = c;
    delete s.compositions.new;
  } else if (action.type === "project-delete") {
    if (asset(action.target) || !s.projects.some(p => p.id === action.target))
      throw new Error("只能删除已保存的项目草稿");
    s.projects = s.projects.filter(p => p.id !== action.target);
    delete s.compositions[action.target];
  } else throw new Error("未知操作");
  s.version++;
  return s;
}

export function contextText(ids, title, description = "") {
  const context = `本次任务：${title}\n目标补充：${description || "请先与我确认具体目标"}\n\n${ids
    .map((id) => {
      const a = asset(id);
      return `【${a.name} / ${CATEGORIES[a.category]}】\n${a.issue || a.summary}\n已知：${a.fact}\n详情：${a.detail}\n来源索引：${a.source}${a.observedAt ? `\n观测时间：${a.observedAt}` : ''}\n问题等级：${a.issue ? (a.severity === "normal" ? "一般" : a.severity === "severe" ? "严重" : "待确认") : "辅助资料"}`;
    })
    .join(
      "\n\n",
    )}\n${ids.map(id=>maintenanceContext(asset(id))).join('\n')}\n接手要求：先阅读项目 AGENTS.md 和以上来源索引，核实当前状态，再提出方案。历史观察不等于实时状态；未核实信息保持待确认。多个问题分别保留结论与处理边界。这里只组装上下文，不代表已经接入、授权执行或完成修复。不得读取或输出密钥明文；真实写入、重启、重试和部署须另行确认授权。`;
  return `${context}\n\n${maintenanceCloseout}`;
}
