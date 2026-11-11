export const initialDockOperations = () => ({
  version: 0,
  tasks: [],
  history: [],
});
const required = (v, label, max = 2000) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw Error(`${label}不能为空且不得超过 ${max} 字`);
  return v.trim();
};
const kinds = [
  "运行排查",
  "账号与双表核对",
  "批次与待补核对",
  "部署与版本核对",
];
export function dockOperationsAction(state, a, now = Date.now()) {
  const s = structuredClone(state);
  let description;
  if (a.type === "prepare") {
    if (!kinds.includes(a.kind)) throw Error("未知任务类型");
    const subject = required(a.subject, "目标引用", 160),
      account = required(a.account, "工作账号引用", 160),
      detail = required(a.detail, "范围与现象", 4000);
    if (!["unknown", "partial", "failed", "check"].includes(a.observed))
      throw Error("观察状态无效");
    const id = `dock-${s.version + 1}`;
    s.tasks.push({
      id,
      kind: a.kind,
      subject,
      account,
      detail,
      observed: a.observed,
      profile: "mkt_dock",
      createdAt: now,
      notes: [],
    });
    description = `准备${a.kind}：${subject}`;
  } else if (a.type === "note") {
    const task = s.tasks.find((t) => t.id === a.id);
    if (!task) throw Error("任务不存在");
    if (
      !["message", "personal", "master", "batch", "deployment"].includes(a.axis)
    )
      throw Error("核对对象无效");
    if (!["confirmed", "failed", "partial", "unknown"].includes(a.result))
      throw Error("记录结果无效");
    if (
      typeof a.observedAt !== "string" ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(a.observedAt) ||
      !Number.isFinite(Date.parse(a.observedAt))
    )
      throw Error("观测时间须包含时区");
    task.notes.push({
      axis: a.axis,
      result: a.result,
      evidence: required(a.evidence, "依据引用"),
      summary: required(a.summary, "核对说明"),
      observedAt: a.observedAt,
      recordedAt: now,
    });
    description = `登记核对记录：${task.subject}（外部报告，未独立核验）`;
  } else throw Error("未知操作");
  s.version++;
  s.history.unshift({ id: `dock-event-${s.version}`, at: now, description });
  return s;
}
