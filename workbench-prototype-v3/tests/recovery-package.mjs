import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inspectRecovery } from '../src/domain/recovery-package.js';

test('registered package: match, tampered, missing and missing tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'recovery-check-'));
  try {
    await mkdir(join(root, 'tools-v2'));
    for (const name of ['WORKBUDDY-HANDOFF.md', 'HANDOFF-CHECKPOINT-WORKBUDDY.json', 'tools-v2/Unlock-PortableRecovery.ps1', 'tools-v2/restore-isolated-20261109.py', 'tools-v2/verify-isolated-api-20261109.py']) await writeFile(join(root, name), 'fixture');
    await writeFile(join(root, 'archive'), 'test');
    const expected = { archive: createHash('sha256').update('test').digest('hex') };
    assert.equal((await inspectRecovery(root, expected)).ok, true);
    await writeFile(join(root, 'archive'), 'tampered');
    const bad = await inspectRecovery(root, expected);
    assert.equal(bad.ok, false);
    assert.equal(bad.files[0].status, 'mismatch');
    await rm(join(root, 'archive'));
    assert.equal((await inspectRecovery(root, expected)).files[0].status, 'missing');
    await writeFile(join(root, 'archive'), 'test');
    await rm(join(root, 'tools-v2/Unlock-PortableRecovery.ps1'));
    assert.equal((await inspectRecovery(root, expected)).ok, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
