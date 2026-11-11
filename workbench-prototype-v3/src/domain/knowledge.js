import { spawn } from 'node:child_process';
import { join } from 'node:path';

export function createKnowledge({root, dir}) {
  return function knowledge(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.env.PYTHON || 'python', ['-X','utf8',join(root,'scripts/knowledge.py'),join(dir,'knowledge'),action], {cwd:root, windowsHide:true, stdio:['pipe','pipe','pipe']});
      let output = '', size = 0, settled = false;
      const finish = (error, value) => { if (settled) return; settled=true; clearTimeout(timer); error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => {child.kill(); finish(new Error('操作超时，请刷新资料库核对实际结果'));}, 260000);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {size += chunk.length; if(size > 16*1024*1024){child.kill();finish(new Error('资料库响应过大'));} else output += chunk.toString('utf8');});
      child.stderr.on('data', () => {});
      child.on('error', () => finish(new Error('知识服务无法启动')));
      child.stdin.on('error', () => {});
      child.on('close', () => {
        try {const result=JSON.parse(output); if(result.error) finish(new Error(result.error)); else finish(null,result);}
        catch {finish(new Error('知识服务未返回有效结果，请刷新核对'));}
      });
      child.stdin.end(JSON.stringify(payload));
    });
  };
}
