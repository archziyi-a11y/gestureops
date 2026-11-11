import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createPrismBatch } from '../src/domain/prism-batch.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const api = createPrismBatch({root});
for (const [action, options] of [['import', {}], ['archive-inspect', {path:'C:/'}], ['isolated-verify', {}], ['archive-verify', {batchId:'../x'}]]) {
  await assert.rejects(api.run(action, options));
}
const inspection = await api.run('archive-inspect');
assert.equal(inspection.ok, true);
const result = await api.run('batch-isolated-verify', {batchId:inspection.data.latestBatchId});
assert.equal(result.ok, true);
assert.equal(result.data.failed, 0);
assert.equal(result.data.completed, result.data.total);
assert.equal(result.data.temporaryDatabaseDeleted, true);
console.log(`Real archive isolated batch: ${result.data.passed}/${result.data.total}; validation guards passed`);
