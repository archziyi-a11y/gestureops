import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createDockManagement } from '../src/domain/dock-management.js';
const management = createDockManagement({ root: fileURLToPath(new URL('..', import.meta.url)) });
await assert.rejects(management('cancel', {id:'abcdef12'}), /unsupported_dock_action/);
await assert.rejects(management('batch', {id:'../secret'}), /invalid_batch_id/);
console.log('dock management action and input contracts passed');
