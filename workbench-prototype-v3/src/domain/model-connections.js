import { spawn } from 'node:child_process';
import { join } from 'node:path';
let pending=Promise.resolve();
export function modelConnections(root,body) {
  const task=pending.then(()=>run(root,body));
  pending=task.catch(()=>{});
  return task;
}
function run(root, body) {
  return new Promise((resolve, reject) => {
    const child=spawn(process.env.PYTHON || 'python',['-X','utf8',join(root,'scripts/model_connections.py')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','ignore']});
    let output='';
    const timer=setTimeout(()=>{child.kill();reject(Error('请求超时，请重新读取核对实际配置'));},35000);
    child.stdout.on('data',chunk=>{output+=chunk; if(output.length>64000) child.kill();});
    child.on('error',()=>{clearTimeout(timer);reject(Error('连接管理服务未启动'));});
    child.stdin.on('error',()=>{});
    child.on('close',()=>{clearTimeout(timer);try{const result=JSON.parse(output);if(result.error)reject(Error(result.error));else resolve(result);}catch{reject(Error('连接管理未返回有效结果'));}});
    child.stdin.end(JSON.stringify(body));
  });
}
