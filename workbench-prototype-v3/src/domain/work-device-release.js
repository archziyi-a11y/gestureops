import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export function createDeviceRelease({ root, dir, run }) {
  const directory = resolve(dir, 'device-releases');
  mkdirSync(directory, { recursive: true });
  const execute = run || ((operation, body) => new Promise((done, reject) => {
    const child = spawn(process.env.PYTHON || 'python', ['-X', 'utf8', join(root, 'scripts/work-device-release.py'), operation], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    child.on('error', () => reject(new Error('release_runner_failed')));
    child.stdin.on('error', () => {});
    child.stdout.on('data', data => { output += data; if (output.length > 65536) child.kill(); });
    child.on('close', code => {
      try { if (code) throw Error(); done(JSON.parse(output)); }
      catch { reject(new Error('release_failed_check_phase')); }
    });
    child.stdin.end(JSON.stringify(body));
  }));
  const location = id => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('invalid_release_id');
    return join(directory, id);
  };
  const receipt = state => ({ releaseId: state.metadata.sha256, ...state.metadata, phase: state.phase, ...(state.app ? { app: state.app } : {}) });
  const status = id => receipt(JSON.parse(readFileSync(location(id) + '.json', 'utf8')));
  async function upload(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 128 * 1024 * 1024) throw new Error('invalid_apk_size');
    const id = createHash('sha256').update(buffer).digest('hex');
    const base = location(id);
    if (existsSync(base + '.json')) return status(id);
    const temporary = join(directory, randomUUID() + '.apk');
    writeFileSync(temporary, buffer, { flag: 'wx', mode: 0o600 });
    try {
      const result = await execute('inspect', { path: temporary });
      if (result.package !== 'com.example.sasalele' || result.sha256 !== id || result.bytes !== buffer.length || !Number.isSafeInteger(result.versionCode) || result.versionCode <= 0 || typeof result.versionName !== 'string') throw new Error('invalid_inspection');
      const metadata = { package: result.package, versionCode: result.versionCode, versionName: result.versionName, sha256: id, bytes: buffer.length };
      try { writeFileSync(base + '.apk', buffer, { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      try {
        const fd = openSync(base + '.json', 'wx', 0o600);
        try { writeFileSync(fd, JSON.stringify({ metadata, phase: 'inspected' })); fsyncSync(fd); } finally { closeSync(fd); }
      } catch (error) { if (error.code !== 'EEXIST') throw error; }
      return status(id);
    } finally { unlinkSync(temporary); }
  }
  return {
    upload, inspect: upload, status,
    async publish(releaseId) {
      const previous = status(releaseId);
      if (previous.phase === 'registered_not_dispatched') return previous;
      await execute('publish', { path: location(releaseId) + '.apk' });
      return status(releaseId);
    },
  };
}
