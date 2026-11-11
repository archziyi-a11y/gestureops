import assert from "node:assert/strict";
import {
  initialDockOperations,
  dockOperationsAction as act,
} from "../src/domain/dock-operations.js";
const a = {
  type: "prepare",
  kind: "账号与双表核对",
  subject: "binding-test",
  account: "account-test",
  detail: "隔离测试",
  observed: "unknown",
};
let s = act(initialDockOperations(), a);
assert.equal(s.tasks[0].profile, "mkt_dock");
assert.throws(() => act(s, { ...a, account: "" }));
assert.throws(() => act(s, { ...a, observed: "success" }));
const n = {
  type: "note",
  id: s.tasks[0].id,
  axis: "personal",
  result: "confirmed",
  observedAt: "2026-11-07T16:00:00+08:00",
  evidence: "test-ref",
  summary: "test report",
};
s = act(s, n);
assert.equal(s.tasks[0].notes.length, 1);
assert.equal(s.tasks[0].observed, "unknown");
assert.equal(s.tasks[0].notes.filter((n) => n.axis === "master").length, 0);
s = act(s, { ...n, axis: "master", result: "unknown" });
assert.equal(s.tasks[0].notes[0].result, "confirmed");
assert.equal(s.tasks[0].notes[1].result, "unknown");
assert.throws(() => act(s, { ...n, observedAt: "2026-11-07" }));
assert.throws(() => act(s, { ...n, id: "missing" }));
console.log("Dock: 10 assertions PASS");
