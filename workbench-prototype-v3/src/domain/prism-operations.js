import { createHash } from "node:crypto";
export const initialPrismOperations = () => ({
  version: 0,
  batches: [],
  tasks: [],
  history: [],
});
const text = (v, label, max = 2000) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw Error(`${label}不能为空且不得超过 ${max} 字`);
  return v.trim();
};
const sources = ["飞书", "微信归档", "本地整理"];
const kinds = ["source_note", "official_note", "teaching_asset"];
export function inspectManifest(input) {
  if (!input || input.schema !== "workbench-prism-index-v1")
    throw Error(
      "不是工作台资料清单 v1；原始采集清单须先转换，不能直接作为入库事件",
    );
  if (!sources.includes(input.source))
    throw Error("来源须为飞书、微信归档或本地整理");
  if (
    !Array.isArray(input.items) ||
    !input.items.length ||
    input.items.length > 100
  )
    throw Error("每批须包含 1–100 条资料");
  const seen = new Set(),
    items = input.items.map((item, i) => {
      const ref = text(item.ref, `第 ${i + 1} 条来源标识`, 500),
        title = text(item.title, "资料标题", 160);
      if (!kinds.includes(item.kind)) throw Error("资料类型不受支持");
      const issues = [];
      const duplicate = seen.has(ref);
      seen.add(ref);
      if (duplicate) issues.push("批内来源标识重复");
      if (!["色彩", "素描", "速写"].includes(item.subject))
        issues.push("科目待确认");
      if (item.kind === "source_note" && !item.authorRef)
        issues.push("教师目录归属缺失");
      const expected = item.mediaExpected,
        available = item.mediaAvailable;
      if (!Number.isInteger(expected) || expected < 0 || expected > 1000)
        throw Error("图片预期数量须为 0–1000 的整数");
      if (
        available !== null &&
        (!Number.isInteger(available) || available < 0 || available > expected)
      )
        throw Error("图片已取得数量须不大于预期；未知填 null");
      if (available === null) issues.push("图片完整性未知");
      else if (available < expected) issues.push("图片存在缺口");
      return {
        ref,
        title,
        kind: item.kind,
        subject: String(item.subject || "").slice(0, 30),
        authorRef: String(item.authorRef || "").slice(0, 200),
        mediaExpected: expected,
        mediaAvailable: available,
        duplicate,
        issues,
      };
    });
  return {
    source: input.source,
    items,
    unique: seen.size,
    duplicates: items.filter((i) => i.duplicate).length,
    blocked: items.filter((i) => i.issues.length).length,
  };
}
export function prismOperationsAction(state, a, now = Date.now()) {
  const s = structuredClone(state),
    id = `prism-${s.version + 1}`;
  let description;
  if (a.type === "manifest-import") {
    const preview = inspectManifest(a.manifest),
      digest = createHash("sha256")
        .update(JSON.stringify(preview))
        .digest("hex");
    if (s.batches.some((b) => b.digest === digest))
      throw Error("相同清单已保存，请打开原批次");
    const b = {
      id,
      name: text(a.name, "批次名称", 160),
      digest,
      ...preview,
      createdAt: now,
      receipts: [],
      taskId: null,
    };
    s.batches.push(b);
    description = `检查资料清单：${b.name}`;
  } else if (a.type === "batch-prepare") {
    const b = s.batches.find((b) => b.id === a.id);
    if (!b) throw Error("批次不存在");
    if (b.taskId) throw Error("该批次已有交接任务");
    const kind = b.blocked ? "核对资料缺口" : "准备入库";
    s.tasks.push({
      id,
      kind,
      subject: b.name,
      batchId: b.id,
      detail: `核对清单对应的真实源资料，不能以本地检查代替媒体和平台查重。${b.blocked ? "先处理清单问题，不授权入库。" : "先生成实际入库预览，写入需另获授权。"} 飞书单向进入 Prism，禁止回写；微信本地归档不等于平台入库。`,
      status: "待接手",
    });
    b.taskId = id;
    description = `准备${kind}任务`;
  } else if (a.type === "receipt-import") {
    const b = s.batches.find((b) => b.id === a.id),
      r = a.receipt;
    if (!b || !b.taskId) throw Error("须先准备批次交接任务");
    if (
      !r ||
      r.schema !== "workbench-prism-receipt-v1" ||
      r.batchId !== b.id ||
      r.digest !== b.digest
    )
      throw Error("回执版本、批次或清单摘要不匹配");
    if (
      !["ingestion", "read"].includes(r.stage) ||
      !["success", "partial", "failed", "unknown"].includes(r.result)
    )
      throw Error("回执阶段或结果无效");
    if (
      typeof r.observedAt !== "string" ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(r.observedAt) ||
      !Number.isFinite(Date.parse(r.observedAt))
    )
      throw Error("观测时间必须包含时区");
    const receipt = {
      stage: r.stage,
      result: r.result,
      observedAt: r.observedAt,
      evidence: text(r.evidence, "证据引用"),
      resourceRef: text(r.resourceRef, "平台资源标识", 500),
      actorRef: text(r.actorRef, "执行或读取身份", 200),
      receivedAt: now,
    };
    if (
      b.receipts.some(
        (x) =>
          JSON.stringify({ ...x, receivedAt: 0 }) ===
          JSON.stringify({ ...receipt, receivedAt: 0 }),
      )
    )
      throw Error("该回执已登记");
    b.receipts.push(receipt);
    description = `登记${r.stage === "read" ? "读取" : "入库"}回执（待核验）`;
  } else if (a.type === "task-prepare") {
    if (!["来源核对", "权限核对", "部署排查"].includes(a.kind))
      throw Error("任务类型无效");
    s.tasks.push({
      id,
      kind: a.kind,
      subject: text(a.subject, "目标对象", 160),
      detail: text(a.detail, "范围与要求", 4000),
      status: "待接手",
    });
    description = `准备${a.kind}任务`;
  } else throw Error("未知操作");
  s.version++;
  s.history.unshift({ id, at: now, description });
  return s;
}
