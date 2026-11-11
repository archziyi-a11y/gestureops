import assert from "node:assert/strict";
import {
  initialSalesOperations,
  salesOperationsAction as act,
} from "../src/domain/sales-operations.js";
let s = initialSalesOperations();
assert.throws(() => act(s, { type: "device-request", label: "test", days: 0 }));
s = act(s, { type: "device-request", label: "test", days: 90 });
assert.equal(s.devices[0].status, "待签发");
s = act(s, { type: "device-cancel", id: s.devices[0].id });
assert.equal(s.devices[0].status, "已取消");
assert.throws(() => act(s, { type: "device-cancel", id: s.devices[0].id }));
s = act(s, {
  type: "knowledge-upload",
  filename: "test.md",
  content: "original",
});
assert.throws(() =>
  act(s, {
    type: "knowledge-upload",
    filename: "other.md",
    content: "original",
  }),
);
s = act(s, { type: "knowledge-upload", filename: "test.md", content: "new" });
const b = s.batches.at(-1);
assert.equal(b.status, "待确认版本关系");
assert.throws(() => act(s, { type: "knowledge-prepare", id: b.id }));
s = act(s, { type: "knowledge-resolve", id: b.id, resolution: "替换旧版" });
s = act(s, { type: "knowledge-prepare", id: b.id });
assert.equal(s.batches[0].content, "original");
assert.equal(s.batches.at(-1).status, "待智能体整理");
assert.throws(() => act(s, { type: "knowledge-prepare", id: b.id }));
assert.throws(() =>
  act(s, { type: "knowledge-upload", filename: "test.pdf", content: "wrong" }),
);
assert.throws(() =>
  act(s, { type: "knowledge-upload", filename: "test.txt", content: "\uFFFD" }),
);
s = act(s, { type: "material-prepare", title: "material", content: "text" });
assert.equal(s.materials[0].status, "待上传团队库");
console.log("Sales operations: 13 assertions PASS");
