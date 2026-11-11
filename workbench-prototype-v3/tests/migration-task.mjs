import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialMigration, migrationErrors, migrationTask } from '../src/ui/migration-task.js';
const valid = () => ({ ...initialMigration(), host: 'test.example.com', user: 'admin' });
test('only destination and account required; package and credential can be pending', () => {
  assert.deepEqual(migrationErrors(valid()), {});
  const text = migrationTask(valid(), null);
  assert.match(text, /尚未取得/);
  assert.match(text, /tools-v2/);
  assert.match(text, /不代表当前最新业务数据/);
  assert.match(text, /复制不是写入/);
});
test('reject missing destination, command-shaped input, bad port and private key text', () => {
  assert.ok(migrationErrors(initialMigration()).host);
  assert.ok(migrationErrors({ ...valid(), host: 'a; shutdown' }).host);
  assert.ok(migrationErrors({ ...valid(), port: '65536' }).port);
  assert.ok(migrationErrors({ ...valid(), credential: '-----BEGIN RSA PRIVATE KEY-----' }).credential);
  assert.ok(migrationErrors({ ...valid(), note: '-----BEGIN PRIVATE KEY-----' }).note);
});
test('changed arrangements and reference reach context without granting downtime', () => {
  const d = { ...valid(), port: '2222', access: 'new', downtime: 'window', credential: 'D:/private/key.pem', auth: 'connection' };
  const text = migrationTask(d, { ok: false, files: [{ status: 'missing' }] });
  assert.match(text, /2222/); assert.match(text, /允许规划新访问地址/);
  assert.match(text, /不能立即停服/); assert.match(text, /D:\/private\/key.pem/);
  assert.match(text, /"ok":false/);
});
