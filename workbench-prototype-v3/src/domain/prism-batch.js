import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const actions = new Set(['archive-inspect', 'archive-verify', 'isolated-verify', 'batch-isolated-verify']);
export function createPrismBatch({ root }) {
  const script = resolve(root, 'scripts/prism-batch.py');
  const venvPython = resolve(root, '../.venv/Scripts/python.exe');
  const venvReady = existsSync(venvPython) && spawnSync(venvPython, ['-c', 'from PIL import Image'], {
    windowsHide: true, shell: false, timeout: 5000, stdio: 'ignore',
  }).status === 0;
  const python = venvReady ? venvPython : 'python';
  let busy = false;
  return {
    async run(action, options = {}) {
      if (!actions.has(action) || !options || typeof options !== 'object' ||
          Object.keys(options).some(key => key !== 'batchId')) throw Error('invalid_request');
      const { batchId } = options;
      if (batchId !== undefined && (typeof batchId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(batchId))) throw Error('invalid_batch_id');
      if (action !== 'archive-inspect' && !batchId) throw Error('batch_id_required');
      if (busy) throw Error('prism_batch_busy');
      busy = true;
      try {
        return await new Promise((accept, reject) => {
          const child = spawn(python, [script], { cwd: resolve(root), windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
          let output = '', exceeded = false, timedOut = false;
          const timer = setTimeout(() => { timedOut = true; child.kill(); }, 120000);
          child.stdout.on('data', chunk => {
            output += chunk;
            if (Buffer.byteLength(output) > 4 * 1024 * 1024) { exceeded = true; child.kill(); }
          });
          child.stderr.resume();
          child.stdin.on('error', () => {});
          child.on('error', () => { clearTimeout(timer); reject(Error('python_unavailable')); });
          child.on('close', code => {
            clearTimeout(timer);
            if (timedOut || exceeded) return reject(Error(timedOut ? 'prism_batch_timeout' : 'prism_batch_output_limit'));
            try {
              const result = JSON.parse(output);
              if (![0, 1].includes(code) || result.schemaVersion !== '1.0' || result.action !== action ||
                  typeof result.ok !== 'boolean' || result.productionTarget?.writeEnabled !== false ||
                  result.productionTarget?.status !== 'unverified' || (code === 0) !== result.ok) throw Error();
              accept(result);
            } catch { reject(Error('invalid_python_response')); }
          });
          child.stdin.end(JSON.stringify({ action, ...(batchId ? { batchId } : {}) }));
        });
      } finally { busy = false; }
    },
  };
}
