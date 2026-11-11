import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export function createDockRuntime({root,dir,python=resolve(root,'../.venv/Scripts/python.exe')}) {
  let pending=false;
  return async body => {
    if(!body || !['describe','test','save','restart','balance'].includes(body.action)) throw Error('不支持的维护操作');
    const allowed=['action','group','revision','values','confirm'];
    if(Object.keys(body).some(k=>!allowed.includes(k))) throw Error('维护参数无效');
    if(pending) throw Error('另一项维护操作正在进行，请等待结果');
    pending=true;
    try { return await new Promise((accept,reject)=>{
      const child=spawn(python,[resolve(root,'scripts/dock-runtime.py'),'--root',resolve(root,'..'),'--state-dir',resolve(dir)],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
      let output='',ended=false;
      const fail=message=>{if(ended)return;ended=true;clearTimeout(timer);reject(Error(message));};
      const timer=setTimeout(()=>{child.kill();fail('维护操作超时，结果待核对，请重新读取后再操作');},90000);
      child.stderr.resume();
      child.stdin.on('error',()=>{});
      child.on('error',()=>fail('维护执行器无法启动'));
      child.stdout.on('data',chunk=>{output+=chunk;if(Buffer.byteLength(output)>1024*1024){child.kill();fail('维护结果超出限制，请重新核对');}});
      child.on('close',code=>{
        if(ended)return;
        try {
          const result=JSON.parse(output);
          if(![0,1].includes(code)||typeof result.ok!=='boolean')throw Error();
          ended=true;clearTimeout(timer);accept(result);
        } catch {fail('维护结果无法读取，请核对实际状态');}
      });
      child.stdin.end(JSON.stringify(body));
    }); } finally {pending=false;}
  };
}
