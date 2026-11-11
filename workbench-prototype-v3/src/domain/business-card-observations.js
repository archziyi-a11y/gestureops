import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const execute = promisify(execFile);
const taskScript = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); $r=@{task=$null;output=$null}; try { $t=Get-ScheduledTask -TaskPath '\\' -TaskName 'SASALELE-Portrait-Sync'; $r.task=@{state=$t.State.ToString();account=$t.Principal.UserId;last=$null;next=$null;result=$null}; try { $i=Get-ScheduledTaskInfo -TaskPath '\\' -TaskName 'SASALELE-Portrait-Sync'; if($i.LastRunTime.Year -gt 2000){$r.task.last=$i.LastRunTime.ToString('o');$r.task.result=[long]$i.LastTaskResult}; if($i.NextRunTime.Year -gt 2000){$r.task.next=$i.NextRunTime.ToString('o')} } catch {}; if(@($t.Actions).Count -eq 1) { $a=$t.Actions[0].Arguments; $m=[regex]::Matches($a,'"([^"]*)"|([^ "]+)'); $v=@($m | ForEach-Object {if($_.Groups[1].Success){$_.Groups[1].Value}else{$_.Groups[2].Value}}); $indexes=@(0..($v.Count-1) | Where-Object {$v[$_] -eq '--output'}); if($rest -notmatch '\\S' -and $v.Count -gt 2 -and [System.IO.Path]::GetFileName($v[0]) -eq 'sync_portraits_local.py' -and $indexes.Count -eq 1 -and $indexes[0]+1 -lt $v.Count -and [System.IO.Path]::IsPathRooted($v[$indexes[0]+1])) {$r.output=$v[$indexes[0]+1]} } } catch {}; $r | ConvertTo-Json -Compress -Depth 4`;
const unknown = (id, source) => ({id, source, status:'unknown', fact:'本地观测不可用', detail:'未将未知结果计为零；未触发业务操作。', issue:'数据源待核对', severity:'unknown'});

export async function readBusinessCards({root, dependencies = {}} = {}) {
  if (!root) throw new TypeError('root is required');
  root = resolve(root);
  const observedAt = new Date().toISOString();
  const live = process.platform === 'win32' && root.toLowerCase() === resolve('D:/Dev/smart-customer-service').toLowerCase();
  const run = dependencies.execFile || execute;
  const options = {windowsHide:true, timeout:15000, maxBuffer:65536, encoding:'utf8'};
  const cards = [];
  const portraitSource = 'Windows Task Scheduler: SASALELE-Portrait-Sync; 任务参数指定的输出文件元数据';
  let task = null, output = null, file = {state:'unavailable'}, association = 'unknown';
  try {
    if (!live && !dependencies.execFile) throw Error();
    const {stdout} = await run('powershell.exe', ['-NoProfile','-NonInteractive','-Command',taskScript], options);
    const data = JSON.parse(stdout.replace(/^\uFEFF/, ''));
    if (data.task && ['Unknown','Disabled','Queued','Ready','Running'].includes(data.task.state)) {
      const time = v => typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null;
      task = {state:data.task.state, account:typeof data.task.account === 'string' ? data.task.account : null, last:time(data.task.last), next:time(data.task.next), result:Number.isSafeInteger(data.task.result) ? data.task.result : null};
    }
    if (typeof data.output === 'string' && data.output && !/[\r\n\0]/.test(data.output)) output = data.output;
  } catch {}
  if (output) {
    association = 'configured-target';
    try {
      if (!live && !dependencies.stat) throw Error();
      const info = await (dependencies.stat || stat)(output);
      file = info.isFile() && Number.isSafeInteger(info.size) && info.mtime instanceof Date && !Number.isNaN(info.mtime.getTime()) ? {state:'present',size:info.size,mtime:info.mtime.toISOString()} : {state:'unavailable'};
    } catch (error) { file = {state:error?.code === 'ENOENT' ? 'missing' : 'unavailable'}; }
  }
  const stateLabel = {Ready:'等待下次运行',Running:'任务运行中',Queued:'任务排队中',Disabled:'任务已停用',Unknown:'调度状态未知'}[task?.state] || '任务状态未取得';
  const fact = `${stateLabel}${task?.result != null ? task.result === 0 ? ' · 上次任务正常退出' : ` · 上次结果码 ${task.result}` : ''}`;
  cards.push({id:'portraits',source:portraitSource,status:task || file.state === 'present' ? 'observed' : 'unknown',fact,detail:'任务退出和文件元数据不证明本次写入、画像新鲜度或业务消费。',portrait:{task,file,output,association},...(task?.state === 'Disabled' || (task?.result != null && task.result !== 0) ? {issue:'调度状态需核对',severity:'unknown'} : {})});
  const source = 'AFTB-Bot production operation_receipt ledger (local read-only)';
  try {
    if (!live && !dependencies.execFile) throw Error();
    const {stdout} = await run(join(root,'.venv/Scripts/python.exe'), ['-X','utf8',join(root,'scripts/read-business-observations.py'),root],options);
    const data = JSON.parse(stdout);
    if (data.state === 'missing') cards.push({...unknown('bridge',source),fact:'未找到生产回执',detail:'已核对本机服务与配置路径；未以人工登记或实验回执替代生产回执。'});
    else {
      const keys = ['total','committedWrites','batchPartial','batchUnknown','errors'];
      if (data.state !== 'observed' || keys.some(k => !Number.isSafeInteger(data[k]) || data[k] < 0 || data[k] > data.total)) throw Error();
      cards.push({id:'bridge',source,status:'observed',fact:`保留回执 ${data.total} 条 · 写入已提交 ${data.committedWrites} 条`,detail:`历史部分批次 ${data.batchPartial}；历史结果未知批次 ${data.batchUnknown}；历史错误回执 ${data.errors}。统计读取时文件保留范围，不是客户数或当前业务成功率；未核验远端表，也未据此判定当前故障。`});
    }
  } catch { cards.push(unknown('bridge',source)); }
  return {observedAt,cards};
}
