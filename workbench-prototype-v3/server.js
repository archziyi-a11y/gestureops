// 零依赖本地服务：静态文件 + 一个很小的 JSON API。
// 状态由服务端持有（data/state.json），所以刷新、换标签页、重启服务看到的都是同一份事实。
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { Store } from './src/domain/store.js';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { initialWorkspace, workspaceAction } from './src/domain/workspace.js';
import { initialSalesOperations, salesOperationsAction } from './src/domain/sales-operations.js';
import { initialPrismOperations, prismOperationsAction } from './src/domain/prism-operations.js';
import { initialDockOperations, dockOperationsAction } from './src/domain/dock-operations.js';
import { inspectRecovery } from './src/domain/recovery-package.js';
import { readWorkDevices } from './src/domain/work-device-reader.js';
import { createDeviceActions } from './src/domain/work-device-actions.js';
import { createDeviceRelease } from './src/domain/work-device-release.js';
import { createDeviceBatch } from './src/domain/work-device-batch.js';
import { createKnowledge } from './src/domain/knowledge.js';
import { modelConnections } from './src/domain/model-connections.js';
import { createBalanceMonitor } from './src/domain/balance-monitor.js';
import { createTeamMaterials } from './src/domain/team-materials.js';
import { createOperationsReminders } from './src/domain/operations-reminders.js';
import { registerObservedAssets, registerCardObservations } from './src/domain/asset-catalog.js';
import { createJobRecords } from './src/domain/job-records.js';
import { readLocalCards } from './src/domain/local-card-observations.js';
import { readInfraCards } from './src/domain/infra-card-observations.js';
import { readSupportCards } from './src/domain/support-card-observations.js';
import { readReportCards } from './src/domain/report-card-observations.js';
import { readGeoCards } from './src/domain/geo-card-observations.js';
import { readBusinessCards } from './src/domain/business-card-observations.js';
import { createDockManagement } from './src/domain/dock-management.js';
import { createPrismBatch } from './src/domain/prism-batch.js';
import { createPrismCollection } from './src/domain/prism-collection.js';
import { prismCardSummary } from './src/domain/prism-card-summary.js';
import { createDockRuntime } from './src/domain/dock-runtime.js';
import { createDockFollowup } from './src/domain/dock-followup.js';
import { createSalesOverviewRefresh } from './src/domain/sales-overview-refresh.js';

const ROOT = resolve(process.cwd());
const PORT = Number(process.env.PORT || 5183);
const HOST = '127.0.0.1';
const STATE_DIR = process.env.STATE_DIR ? resolve(process.env.STATE_DIR) : join(ROOT, 'data');
const dockManagement = createDockManagement({root:ROOT,python:resolve(ROOT,'../.venv/Scripts/python.exe')});
const prismBatch = createPrismBatch({root:ROOT});
const prismCollection = createPrismCollection({root:ROOT,dir:join(STATE_DIR,'prism-collection')});
const dockRuntime = createDockRuntime({root:ROOT,dir:join(STATE_DIR,'dock-runtime')});
const dockFollowup = createDockFollowup({root:ROOT,dir:join(STATE_DIR,'dock-followup')});
let cardSnapshot, cardPending;
async function cardObservations() {
  if (cardSnapshot && Date.now() - cardSnapshot.readAt < 60000) return cardSnapshot;
  if (!cardPending) cardPending = Promise.all([
    readLocalCards({root:resolve(ROOT,'..')}), readInfraCards({root:ROOT,dir:STATE_DIR,dockSnapshot:structuredClone(dock)}),
    readSupportCards({root:resolve(ROOT,'..'),balance:balanceMonitor.snapshot()}),
    readReportCards({root:ROOT}),
    readGeoCards({root:resolve(ROOT,'..')}),
    readBusinessCards({root:resolve(ROOT,'..')}),
  ]).then(async results => {
    const cards=new Map();
    for(const result of results)for(const card of result.cards)cards.set(card.id,{...card,observedAt:result.observedAt});
    cards.set('prism',{...await prismCardSummary({collection:prismCollection.snapshot(),localCards:[...cards.values()]}),observedAt:new Date().toISOString()});
    cardSnapshot={readAt:Date.now(),cards:[...cards.values()]};
    registerCardObservations(cardSnapshot.cards);
    return cardSnapshot;
  }).finally(()=>{cardPending=null;});
  return cardPending;
}

const store = new Store({ dir: STATE_DIR });
const jobRecords = createJobRecords({dir:STATE_DIR});
const rawReminders = createOperationsReminders({dir:STATE_DIR});
const reminders = {...rawReminders,run:(meta,execute)=>jobRecords.run(meta,()=>rawReminders.run(meta,execute))};
const balanceMonitor=createBalanceMonitor({dir:STATE_DIR,query:async target=>{
  if(target!=='dock')return modelConnections(ROOT,{target,action:'balance'});
  const result=await dockRuntime({action:'balance'});
  if(!result.ok)throw Object.assign(Error(result.message || '余额查询失败'),{code:result.error});
  return result;
}});
const deviceActions = createDeviceActions({root:ROOT,dir:STATE_DIR});
const deviceRelease = createDeviceRelease({root:ROOT,dir:STATE_DIR});
const deviceBatch = createDeviceBatch({dir:STATE_DIR,release:deviceRelease,actions:deviceActions,readDevices:()=>readWorkDevices(ROOT)});
const rawKnowledge = createKnowledge({root:ROOT,dir:STATE_DIR});
const knowledge = (action, body = {}) => reminders.run({area:'knowledge',action,target:body.feature || body.task || '',object:body.id || body.version_id || body.requestId || ''},()=>rawKnowledge(action,body));
const teamMaterials = createTeamMaterials({root:ROOT,dir:join(STATE_DIR,'material-receipts')});
const salesOverview = createSalesOverviewRefresh({reminders:rawReminders, readDevices:()=>readWorkDevices(ROOT), readMaterials:()=>teamMaterials.read(), readModel:body=>modelConnections(ROOT,body), balanceMonitor});
const workspaceFile = join(STATE_DIR, 'workspace.json');
let workspace;
try { workspace = JSON.parse(readFileSync(workspaceFile, 'utf8')); }
catch (err) { if (err.code !== 'ENOENT') throw err; workspace = initialWorkspace(); }
const operationsFile = join(STATE_DIR, 'sales-operations.json');
const dockFile=join(STATE_DIR,'dock-operations.json');
let dock;
try {dock=JSON.parse(readFileSync(dockFile,'utf8'));}
catch(err){if(err.code!=='ENOENT')throw err;dock=initialDockOperations();}
const prismFile = join(STATE_DIR, 'prism-operations.json');
let prism;
try { prism = JSON.parse(readFileSync(prismFile, 'utf8')); }
catch (err) { if (err.code !== 'ENOENT') throw err; prism = initialPrismOperations(); }
let operations;
try { operations = JSON.parse(readFileSync(operationsFile, 'utf8')); }
catch (err) { if (err.code !== 'ENOENT') throw err; operations = initialSalesOperations(); }

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(body);
}

async function readBody(req, limit = 1024 * 256) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('请求体不是有效 JSON');
  }
}

async function readApk(req) {
  const chunks=[];
  let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>128*1024*1024)throw new Error('invalid_apk_size');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function tryFile(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    return { path, size: info.size };
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if(url.pathname==='/api/prism-collection') {
      const host=req.headers.host||'';
      if(!['127.0.0.1','localhost'].includes(host.split(':')[0])||req.headers['sec-fetch-site']==='cross-site')return sendJson(res,403,{error:'仅允许本机访问'});
      if(req.method==='GET')return sendJson(res,200,prismCollection.snapshot());
      if(req.method!=='POST'||req.headers.origin!==`http://${host}`||!String(req.headers['content-type']).startsWith('application/json'))return sendJson(res,403,{error:'仅允许从工作台提交'});
      try{return sendJson(res,202,{job:prismCollection.start(await readBody(req,2048))});}
      catch(error){return sendJson(res,400,{error:error.message});}
    }
    if(url.pathname==='/api/dock-followup') {
      const host=req.headers.host||'';
      if(!['127.0.0.1','localhost'].includes(host.split(':')[0])||req.method!=='POST'||req.headers.origin!==`http://${host}`||!String(req.headers['content-type']).startsWith('application/json'))return sendJson(res,403,{ok:false,error:'invalid_request'});
      try {
        const body=await readBody(req,4096);
        const result=await reminders.runDock({action:body.action,object:body.batchCode || body.token || ''},()=>jobRecords.run({area:'dock-followup',action:body.action==='send'?'dock-card-send':'dock-card-preview'},()=>dockFollowup(body)));
        return sendJson(res,200,result);
      }catch{return sendJson(res,503,{ok:false,status:'unknown',error:'operation_failed'});}
    }
    if(url.pathname==='/api/dock-runtime') {
      const host=req.headers.host || '';
      if(!['127.0.0.1','localhost'].includes(host.split(':')[0]) || req.headers['sec-fetch-site']==='cross-site') return sendJson(res,403,{ok:false,message:'仅允许本机工作台访问'});
      let body;
      if(req.method==='GET') body={action:'describe'};
      else if(req.method==='POST' && req.headers.origin===`http://${host}` && String(req.headers['content-type']).startsWith('application/json')) body=await readBody(req,16384);
      else return sendJson(res,403,{ok:false,message:'仅允许从本机工作台提交'});
      try {
        if(body.action==='balance')return sendJson(res,200,await balanceMonitor.check('dock'));
        const result=await reminders.runDock({action:body.action,object:body.group || ''},()=>jobRecords.run({area:'dock-runtime',action:`dock-${body.action}`},async()=>{
          const result=await dockRuntime(body);
          return {...result,status:result.ok?'knownsuccess':body.action==='restart'&&!result.error?'unknown':'knownfailure'};
        }));
        return sendJson(res,200,result);
      }
      catch(error) {return sendJson(res,503,{ok:false,message:error.message});}
    }
    if (['/api/dock-management','/api/prism-batch'].includes(url.pathname)) {
      const host=req.headers.host || '';
      if (!['127.0.0.1','localhost'].includes(host.split(':')[0]) || req.headers['sec-fetch-site']==='cross-site') return sendJson(res,403,{error:'仅允许本机工作台访问'});
      const isDock=url.pathname==='/api/dock-management';
      let body;
      if(req.method==='GET') body=Object.fromEntries(url.searchParams);
      else if(req.method==='POST' && req.headers.origin===`http://${host}` && String(req.headers['content-type']).startsWith('application/json')) body=await readBody(req,2048);
      else return sendJson(res,403,{error:'仅允许从本机工作台提交'});
      const allowed=isDock ? (req.method==='GET'?['overview','batch']:['diagnose']) : (req.method==='GET'?['archive-inspect']:['archive-verify','isolated-verify','batch-isolated-verify']);
      const fields=isDock?['action','id']:['action','batchId'];
      if(!body || typeof body!=='object' || !allowed.includes(body.action) || Object.keys(body).some(key=>!fields.includes(key))) return sendJson(res,400,{error:'不支持的检查请求'});
      try { const result=await (isDock ? dockManagement(body.action,body) : prismBatch.run(body.action,body.batchId === undefined ? {} : {batchId:body.batchId})); if(isDock && body.action!=='batch')reminders.syncDock(result); return sendJson(res,200,result); }
      catch { return sendJson(res,503,{error:isDock?'对接表检查未完成，请重新读取。':'Prism 批次检查未完成，请重新读取。'}); }
    }
    if(url.pathname==='/api/card-observations' && req.method==='GET') {
      if(!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0]))return sendJson(res,403,{error:'仅允许本机访问'});
      const value=await cardObservations();
      const issues=reminders.snapshot().issues.filter(issue=>issue.project==='bridge');
      const cards=value.cards.map(card=>card.id==='bridge'&&issues.length?{...card,fact:`${issues[0].title}${issues.length>1?` · ${issues.length} 项需处理`:''}`,issue:issues[0].impact,severity:issues[0].severity,incidentKind:issues[0].kind,detail:issues.map(issue=>`${issue.title}：${issue.impact}\n下一步：${issue.next}\n最近观测：${issue.lastSeen}`).join('\n\n')}:card);
      registerCardObservations(cards);
      return sendJson(res,200,{...value,cards});
    }
    if(url.pathname==='/api/job-records' && req.method==='GET') {
      if(!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0]))return sendJson(res,403,{error:'仅允许本机访问'});
      return sendJson(res,200,{...jobRecords.snapshot(),deviceReceipts:deviceActions.history(),batches:deviceBatch.list()});
    }
    if(url.pathname==='/api/operations-reminders' && req.method==='GET') {
      if(!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0]))return sendJson(res,403,{error:'仅允许本机访问'});
      const salesObservation=await salesOverview.refresh();
      reminders.syncBalance(balanceMonitor.snapshot());
      reminders.syncDeviceReceipts(deviceBatch.list());
      const snapshot=reminders.snapshot();
      const assets=reminders.assets();
      registerObservedAssets(assets);
      return sendJson(res,200,{...snapshot,assets,balance:balanceMonitor.snapshot(),salesObservation});
    }
    if(url.pathname==='/api/balance-monitor') {
      if(!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0]))return sendJson(res,403,{error:'仅允许本机访问'});
      if(req.method==='GET')return sendJson(res,200,balanceMonitor.snapshot());
      if(req.method!=='POST'||req.headers.origin!==`http://${req.headers.host}`||!String(req.headers['content-type']).startsWith('application/json'))return sendJson(res,403,{error:'仅允许从本机工作台提交'});
      try{return sendJson(res,200,balanceMonitor.configure(await readBody(req,1024)));}
      catch(error){return sendJson(res,400,{error:error.message});}
    }
    if(url.pathname==='/api/sales-runtime' && req.method==='GET') {
      try { return sendJson(res,200,await modelConnections(ROOT,{target:'sales',action:'runtime'})); }
      catch { return sendJson(res,503,{error:'生成运行记录暂时无法读取'}); }
    }
    if(url.pathname==='/api/model-connections') {
      if(!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0]) || req.method!=='POST' || req.headers.origin!==`http://${req.headers.host}` || !String(req.headers['content-type']).startsWith('application/json')) return sendJson(res,403,{error:'仅允许从本机工作台提交'});
      try{const body=await readBody(req,8192);return sendJson(res,200,body.action==='balance'?await balanceMonitor.check(body.target):await reminders.run({area:'model',action:body.action,target:body.target},()=>modelConnections(ROOT,body)));}
      catch(error){return sendJson(res,400,{error:error.message});}
    }
    if (url.pathname.startsWith('/api/knowledge') || url.pathname.startsWith('/api/team-materials')) {
      if (!['127.0.0.1','localhost'].includes((req.headers.host || '').split(':')[0])) return sendJson(res,403,{error:'无效的本地访问地址'});
      if (req.method==='POST' && (req.headers.origin!==`http://${req.headers.host}` || !String(req.headers['content-type']).startsWith('application/json'))) return sendJson(res,403,{error:'仅允许从本机工作台提交'});
      if(url.pathname==='/api/knowledge' && req.method==='GET') return sendJson(res,200,await knowledge('snapshot'));
      const knowledgeAction = /^\/api\/knowledge\/(upload|review|publish|withdraw|query|organize|prompt-save|business-snapshot|business-save|business-delete|business-release|business-compare|source-snapshot|source-upload|source-update|source-prepare|source-download|source-detail)$/.exec(url.pathname)?.[1];
      if(knowledgeAction && req.method==='POST') {
        try {return sendJson(res,200,await knowledge(knowledgeAction,await readBody(req,12*1024*1024)));}
        catch(error){return sendJson(res,400,{error:error.message});}
      }
      if(url.pathname==='/api/team-materials' && req.method==='GET') {
        try{return sendJson(res,200,await reminders.run({area:'materials',action:'list'},()=>teamMaterials.read()));}
        catch{return sendJson(res,502,{error:'团队物料读取失败，请检查销售服务连接后刷新'});}
      }
      if(url.pathname==='/api/team-materials' && req.method==='POST') {
        try{const body=await readBody(req,12*1024*1024);return sendJson(res,200,await reminders.run({area:'materials',action:'upload',object:body.requestId},()=>teamMaterials.upload(body)));}
        catch{return sendJson(res,400,{error:'未下发上传：请核对标题、内容、文件大小或提交记录'});}
      }
      if(url.pathname==='/api/team-materials/capabilities' && req.method==='GET') return sendJson(res,200,await teamMaterials.capabilities());
      if(url.pathname==='/api/team-materials/delete' && req.method==='POST') {
        try{const body=await readBody(req,4096);return sendJson(res,200,await reminders.run({area:'materials',action:'delete',object:body.id},()=>teamMaterials.remove(body)));}
        catch{return sendJson(res,400,{error:'未删除：物料标识或标题无效'});}
      }
      const imageId = /^\/api\/team-materials\/images\/([a-zA-Z0-9-]{1,80})$/.exec(url.pathname)?.[1];
      if(imageId && req.method==='GET') {
        try {
          const picture=await teamMaterials.image(imageId);
          res.writeHead(200,{'content-type':picture.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff'});
          return res.end(Buffer.from(picture.base64,'base64'));
        }catch{return sendJson(res,502,{error:'图片读取失败'});}
      }
      return sendJson(res,404,{error:'接口不存在'});
    }
    if (url.pathname.startsWith('/api/work-devices')) {
      // This local admin API must not accept cross-site writes or DNS-rebinding hosts.
      if (!['127.0.0.1','localhost'].includes((req.headers.host || '').split(':')[0])) return sendJson(res,403,{error:'无效的本地访问地址'});
      const contentType=url.pathname==='/api/work-devices/releases'?'application/octet-stream':'application/json';
      if (req.method==='POST' && (req.headers.origin!==`http://${req.headers.host}` || !String(req.headers['content-type']).startsWith(contentType))) return sendJson(res,403,{error:'仅允许从本机工作台提交'});
      if(url.pathname==='/api/work-devices/releases'&&req.method==='POST'){
        try{return sendJson(res,200,await deviceRelease.upload(await readApk(req)));}
        catch{return sendJson(res,400,{error:'安装包检查未通过：请使用同一签名的销售助手 APK，且不超过 128 MiB'});}
      }
      if(url.pathname==='/api/work-devices/batches'&&req.method==='GET')return sendJson(res,200,deviceBatch.list());
      if(url.pathname==='/api/work-devices/batches'&&req.method==='POST'){
        try{return sendJson(res,200,deviceBatch.start(await readBody(req)));}
        catch(error){return sendJson(res,409,{error:error.message==='batch_in_progress'?'已有批量更新正在进行，请等待结果':'批量任务未创建，请刷新记录后核对选择'});}
      }
      if(url.pathname.startsWith('/api/work-devices/batches/')&&req.method==='GET'){
        const record=deviceBatch.get(url.pathname.split('/').at(-1));
        return sendJson(res,record?200:404,record||{error:'批量任务不存在'});
      }
      if (url.pathname==='/api/work-devices/apps' && req.method==='GET') {
        try {return sendJson(res,200,await deviceActions.catalog());}
        catch {return sendJson(res,502,{error:'销售助手安装包读取失败，请稍后重试'});}
      }
      if (url.pathname==='/api/work-devices/actions' && req.method==='GET') return sendJson(res,200,await deviceActions.history());
      if (url.pathname==='/api/work-devices/actions' && req.method==='POST') {
        try {const body=await readBody(req);return sendJson(res,200,await reminders.run({area:'devices',action:'submit',target:body.deviceId,object:body.appId},()=>deviceActions.submit(body)));}
        catch(error) {return sendJson(res,400,{error:({invalid_action_request:'设备或安装包信息无效，请重新选择',request_id_conflict:'此提交编号已使用，请刷新记录核对'})[error.message] || '提交未完成，请刷新下发记录核对'});}
      }
    }
    if (url.pathname === '/api/work-devices' && req.method === 'GET') {
      try { sendJson(res, 200, await reminders.run({area:'devices',action:'inventory'},()=>readWorkDevices(ROOT))); }
      catch { sendJson(res, 502, { error: '方舟设备清单读取失败，请检查连接后重试' }); }
      return;
    }

    // ---------- API ----------
    if (url.pathname === '/api/recovery-package' && req.method === 'GET') {
      return sendJson(res, 200, await inspectRecovery());
    }
    if(url.pathname==='/api/dock-operations'&&req.method==='GET')return sendJson(res,200,{ok:true,operations:dock});
    if(url.pathname==='/api/dock-operations'&&req.method==='POST'){
      const body=await readBody(req);
      if(body.version!==dock.version)return sendJson(res,409,{ok:false,message:'记录已更新，请核对后重试',operations:dock});
      try{const next=dockOperationsAction(dock,body);writeFileSync(dockFile+'.tmp',JSON.stringify(next,null,2));renameSync(dockFile+'.tmp',dockFile);dock=next;return sendJson(res,200,{ok:true,operations:dock});}
      catch(error){return sendJson(res,400,{ok:false,message:error.message});}
    }
    if (url.pathname === '/api/prism-operations' && req.method === 'GET') return sendJson(res,200,{ok:true,operations:prism});
    if (url.pathname === '/api/prism-operations' && req.method === 'POST') {
      const body=await readBody(req);
      if(body.version!==prism.version) return sendJson(res,409,{ok:false,message:'记录已更新，请核对后重试',operations:prism});
      try {
        const next=prismOperationsAction(prism,body);
        writeFileSync(prismFile+'.tmp',JSON.stringify(next,null,2));renameSync(prismFile+'.tmp',prismFile);prism=next;
        return sendJson(res,200,{ok:true,operations:prism});
      } catch(error) {return sendJson(res,400,{ok:false,message:error.message});}
    }
    if (url.pathname === '/api/sales-operations' && req.method === 'GET') return sendJson(res, 200, { ok: true, operations });
    if (url.pathname === '/api/sales-operations' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.version !== operations.version) return sendJson(res, 409, { ok: false, message: '记录已更新，请核对后重试', operations });
      try {
        const next = salesOperationsAction(operations, body);
        writeFileSync(operationsFile + '.tmp', JSON.stringify(next, null, 2));
        renameSync(operationsFile + '.tmp', operationsFile);
        operations = next;
        return sendJson(res, 200, { ok: true, operations });
      } catch (error) { return sendJson(res, 400, { ok: false, message: error.message }); }
    }
    if (url.pathname === '/api/workspace' && req.method === 'GET') {
      return sendJson(res, 200, {ok:true, workspace, assets:reminders.assets()});
    }
    if (url.pathname === '/api/workspace' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.version !== workspace.version) return sendJson(res, 409, {ok:false, message:'草稿已在另一页面更新，请核对后重试。', workspace});
      try {
        registerObservedAssets(reminders.assets());
        const next = workspaceAction(workspace, body);
        writeFileSync(workspaceFile + '.tmp', JSON.stringify(next, null, 2));
        renameSync(workspaceFile + '.tmp', workspaceFile);
        workspace = next;
        return sendJson(res, 200, {ok:true, workspace});
      } catch (err) { return sendJson(res, 400, {ok:false,message:err.message}); }
    }
    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, at: Date.now() });
      return;
    }

    if (url.pathname === '/api/state' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, state: store.view() });
      return;
    }

    if (url.pathname === '/api/receipt-sample' && req.method === 'GET') {
      const jobId = url.searchParams.get('jobId') || 'JOB-2406';
      const kind = url.searchParams.get('kind') || 'matched';
      const sample = store.receiptSample(jobId, kind);
      if (!sample) {
        sendJson(res, 409, {
          ok: false,
          level: 'error',
          message: '还没有可对照的接手包，先生成并复制提示词。'
        });
        return;
      }
      sendJson(res, 200, { ok: true, sample });
      return;
    }

    if (url.pathname === '/api/reset' && req.method === 'POST') {
      const result = store.act('reset');
      sendJson(res, 200, { ...result, state: store.view() });
      return;
    }

    if (url.pathname === '/api/action' && req.method === 'POST') {
      const payload = await readBody(req);
      const { type, ...rest } = payload || {};
      if (!type) {
        sendJson(res, 400, { ok: false, level: 'error', message: '缺少操作类型。' });
        return;
      }
      const result = store.act(type, rest);
      sendJson(res, 200, { ...result, state: store.view() });
      return;
    }

    // ---------- 静态文件 ----------
    let pathname = decodeURIComponent(url.pathname);
    if (/^\/data(?:\/|$)/i.test(pathname)) return res.writeHead(403).end('forbidden');
    if (pathname === '/') pathname = '/index.html';

    const target = normalize(join(ROOT, pathname));
    if (!target.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    let found = await tryFile(target);
    if (!found && !extname(pathname)) found = await tryFile(join(ROOT, 'index.html'));
    if (!found) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }

    const body = await readFile(found.path);
    res.writeHead(200, {
      'content-type': MIME[extname(found.path).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(body);
  } catch (err) {
    sendJson(res, 500, { ok: false, level: 'error', message: err.message });
  }
});

server.listen(PORT, HOST, () => {
  if(process.env.BALANCE_MONITOR_DISABLED!=='1')balanceMonitor.start();
  const base = `http://${HOST}:${PORT}`;
  console.log('');
  console.log('  屹立工作台 V3 · 工作机已接入方舟');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  打开          ${base}/`);
  console.log(`  仪表盘        ${base}/#/`);
  console.log(`  四宫格        ${base}/#/grid`);
  console.log(`  销售助手      ${base}/#/p/sales`);
  console.log(`  迁移准备      ${base}/#/p/sales/migrate`);
  console.log(`  作业记录      ${base}/#/records`);
  console.log(`  状态文件      ${join(STATE_DIR, 'state.json')}`);
  console.log('  按 Ctrl+C 停止');
  console.log('');
});
