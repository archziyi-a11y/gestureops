import assert from "node:assert/strict";
import {
  initialPrismOperations,
  prismOperationsAction as act,
  inspectManifest,
} from "../src/domain/prism-operations.js";
const manifest = {
  schema: "workbench-prism-index-v1",
  source: "本地整理",
  items: [
    {
      ref: "a",
      title: "note",
      kind: "source_note",
      subject: "色彩",
      authorRef: "teacher",
      mediaExpected: 2,
      mediaAvailable: 1,
    },
  ],
};
let s = act(initialPrismOperations(), {
  type: "manifest-import",
  name: "test",
  manifest,
});
assert.equal(s.batches[0].blocked, 1);
assert.throws(() =>
  act(s, { type: "manifest-import", name: "test", manifest }),
);
s = act(s, { type: "batch-prepare", id: s.batches[0].id });
assert.equal(s.tasks[0].kind, "核对资料缺口");
assert.throws(() => act(s, { type: "batch-prepare", id: s.batches[0].id }));
const b = s.batches[0],
  receipt = {
    schema: "workbench-prism-receipt-v1",
    batchId: b.id,
    digest: b.digest,
    stage: "ingestion",
    result: "partial",
    observedAt: "2026-11-07T12:00:00+08:00",
    actorRef: "test-agent",
    resourceRef: "test-note",
    evidence: "test-only receipt",
  };
assert.throws(() =>
  act(s, {
    type: "receipt-import",
    id: b.id,
    receipt: { ...receipt, digest: "wrong" },
  }),
);
assert.throws(() =>
  act(s, {
    type: "receipt-import",
    id: b.id,
    receipt: { ...receipt, observedAt: "2026-11-07" },
  }),
);
s = act(s, { type: "receipt-import", id: b.id, receipt });
assert.equal(s.batches[0].receipts[0].result, "partial");
assert.throws(() => act(s, { type: "receipt-import", id: b.id, receipt }));
assert.equal(
  inspectManifest({
    ...manifest,
    items: [...manifest.items, ...manifest.items],
  }).duplicates,
  1,
);
assert.equal(
  inspectManifest({
    ...manifest,
    items: [{ ...manifest.items[0], mediaAvailable: null }],
  }).blocked,
  1,
);
assert.throws(() =>
  inspectManifest({
    ...manifest,
    items: [{ ...manifest.items[0], mediaAvailable: 3 }],
  }),
);
assert.equal(
  inspectManifest({
    ...manifest,
    items: [{ ...manifest.items[0], mediaAvailable: 2 }],
  }).blocked,
  0,
);
assert.equal(s.batches[0].receipts.filter((r) => r.stage === "read").length, 0);
console.log("Prism: 13 assertions PASS");
