import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
let pending;
export function readWorkDevices(root) {
  if (!pending) pending = execute(process.env.PYTHON || 'python', ['-X', 'utf8', `${root}/scripts/read-work-devices.py`],
    { cwd: root, timeout: 90000, maxBuffer: 1024 * 1024, windowsHide: true })
    .then(({ stdout }) => JSON.parse(stdout)).finally(() => { pending = null; });
  return pending;
}
