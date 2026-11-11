import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createDeviceRelease } from '../src/domain/work-device-release.js';

test('upload is local, sha-idempotent, and rejects invalid inputs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-'));
  const buffer = Buffer.from('fake apk');
  const calls = [];
  const service = createDeviceRelease({ root: '.', dir, run: async op => {
    calls.push(op);
    return { package: 'com.example.sasalele', versionCode: 36, versionName: 'test', sha256: createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length };
  } });
  try {
    const first = await service.upload(buffer);
    assert.equal(first.phase, 'inspected');
    assert.deepEqual(await service.upload(buffer), first);
    assert.deepEqual(calls, ['inspect']);
    await assert.rejects(service.upload(Buffer.alloc(0)));
    await assert.rejects(service.upload('x'));
    await assert.rejects(service.publish('../escape'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
