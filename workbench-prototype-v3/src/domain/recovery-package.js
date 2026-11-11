import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const recoveryRoot = 'D:/SASALELE-BACKUP-20261109';
export const expectedFiles = {
  'images.tar.gz': 'cd1474e8f11a91e0c0b6abb463557d177ef97c7121c40deda2cff5d2dd143661',
  'recovery-portable.aesgcm': '9b20cc427950e3eca63e9f37d7466e228ba84069207575d4345f87ce265609bb',
};
// Only this registered package is accessible; never accept a browser-supplied path.
export async function inspectRecovery(root = recoveryRoot, expected = expectedFiles) {
  const startedAt = new Date().toISOString();
  const files = [];
  for (const [name, sha256] of Object.entries(expected)) {
    try {
      const path = join(root, name), before = await stat(path);
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      const actual = hash.digest('hex'), after = await stat(path);
      files.push({ name, bytes: after.size, sha256: actual,
        status: before.size !== after.size || before.mtimeMs !== after.mtimeMs ? 'changed_during_check' : actual === sha256 ? 'match' : 'mismatch' });
    } catch (error) {
      files.push({ name, status: error.code === 'ENOENT' ? 'missing' : 'unreadable' });
    }
  }
  const required = ['WORKBUDDY-HANDOFF.md', 'HANDOFF-CHECKPOINT-WORKBUDDY.json',
    'tools-v2/Unlock-PortableRecovery.ps1', 'tools-v2/restore-isolated-20261109.py', 'tools-v2/verify-isolated-api-20261109.py'];
  const tools = await Promise.all(required.map(async name => {
    try { return { name, present: (await stat(join(root, name))).isFile() }; }
    catch { return { name, present: false }; }
  }));
  return { packageId: 'sales-20261109', root, startedAt, checkedAt: new Date().toISOString(),
    clock: 'local-server', files, tools, ok: files.every(f => f.status === 'match') && tools.every(t => t.present) };
}
