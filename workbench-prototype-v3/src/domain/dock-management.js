import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
const execute = promisify(execFile);

export function createDockManagement({ root, python = 'python' }) {
  return async (action = 'overview', body = {}) => {
    if (!['overview', 'diagnose', 'batch'].includes(action)) throw new Error('unsupported_dock_action');
    if (action === 'batch' && !/^[a-f0-9]{8}$/i.test(body.id || '')) throw new Error('invalid_batch_id');
    try {
      const { stdout } = await execute(python, [resolve(root, 'scripts/dock-management.py'), '--root', resolve(root, '..'), '--action', action, ...(action === 'batch' ? ['--id', body.id] : [])], { timeout: 20000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, encoding: 'utf8' });
      return JSON.parse(stdout);
    } catch { throw new Error('dock_management_unavailable'); }
  };
}
