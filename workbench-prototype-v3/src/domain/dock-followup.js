import {spawn} from 'node:child_process';
import {resolve} from 'node:path';

export function createDockFollowup({root,dir,python=resolve(root,'../.venv/Scripts/python.exe')}) {
  let busy=false;
  return async body=>{
    const keys=body?.action==='preview'?['action','batchCode']:body?.action==='send'?['action','token','confirm']:[];
    if(!keys.length||Object.keys(body).some(k=>!keys.includes(k))||
      (body.action==='preview'&&!/^[A-Za-z0-9_-]{1,100}$/.test(body.batchCode||''))||
      (body.action==='send'&&(body.confirm!==true||typeof body.token!=='string'||body.token.length>200||!body.token)))throw Error('待补卡片参数无效');
    if(busy)throw Error('另一项卡片操作正在进行');
    busy=true;
    try{return await new Promise((resolveResult,reject)=>{
      const child=spawn(python,[resolve(root,'scripts/dock-followup.py'),'--root',resolve(root,'..'),'--state-dir',resolve(dir)],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
      let output='',finished=false;
      const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolveResult(result);};
      const timer=setTimeout(()=>{child.kill();finish(Error('请求超时，发送结果须核对，不要重复发送'));},90000);
      child.stderr.resume();child.stdin.on('error',()=>{});
      child.on('error',()=>finish(Error('待补卡片执行器无法启动')));
      child.stdout.on('data',chunk=>{output+=chunk;if(Buffer.byteLength(output)>1048576){child.kill();finish(Error('卡片结果过大，请核对发送记录'));}});
      child.on('close',code=>{try{const result=JSON.parse(output);if(![0,1].includes(code)||typeof result.ok!=='boolean')throw Error();finish(null,result);}catch{finish(Error('未取得有效回执，请核对发送记录'));}});
      child.stdin.end(JSON.stringify(body));
    });}finally{busy=false;}
  };
}
