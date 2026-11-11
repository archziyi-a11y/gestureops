import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { get } from 'node:http';

const require=createRequire(import.meta.url);
const {chromium}=require(join(process.env.BUNDLED_NODE_MODULES,'playwright'));
const dir=mkdtempSync(join(tmpdir(),'workbench-management-'));
const probe=createServer();
await new Promise(r=>probe.listen(0,'127.0.0.1',r));
const port=probe.address().port;
await new Promise(r=>probe.close(r));
const server=spawn(process.execPath,['server.js'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,STATE_DIR:dir,PORT:String(port),BALANCE_MONITOR_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let output='',browser;
server.stderr.on('data',chunk=>output+=chunk);
try {
  const base=`http://127.0.0.1:${port}`;
  let ready=false;
  for(let i=0;i<100;i++) {try {if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,output);
  // Invalid requests must be rejected before starting a local reader.
  assert.equal((await fetch(base+'/api/prism-batch?action=import')).status,400);
  assert.equal((await fetch(base+'/api/dock-management?action=overview&path=secret')).status,400);
  assert.equal((await fetch(base+'/api/prism-batch',{method:'POST',headers:{'content-type':'application/json',origin:'https://example.com'},body:JSON.stringify({action:'archive-verify'})})).status,403);
  const badHostStatus=await new Promise((resolve,reject)=>get(base+'/api/dock-management?action=overview',{headers:{host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));
  assert.equal(badHostStatus,403);
  assert.equal((await fetch(base+'/api/dock-runtime',{method:'POST',headers:{'content-type':'application/json',origin:'https://example.com'},body:'{"action":"restart"}'})).status,403);
  assert.equal((await fetch(base+'/api/dock-followup',{method:'POST',headers:{'content-type':'application/json',origin:'https://example.com'},body:'{"action":"preview","batchCode":"495C6AEC"}'})).status,403);

  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let fail=false,reads=0,followupMode='normal';
  const fixture={observedAt:'2026-11-10T08:30:00Z',clockSource:'host',service:{name:'AFTB-Bot',status:'Running'},config:{bindingVerified:true,items:[{key:'AFTB_APP_SECRET',configured:true},{key:'AFTB_MKT_EXCEL_IMPORT_ENABLED',enabled:true}],source:'service'},bindings:{status:'available',items:[{accountRef:'staff-01',displayName:'测试工作账号',childTableRef:'child-01',masterTableRef:'master-01',state:'ready'}]},batches:{status:'available',items:[{id:'495C6AEC',accountRef:'staff-01',created:1794299400,status:'done',counts:{success:2,failed:1},expired:false},{id:'ABCDEF12',accountRef:'staff-01',created:1794299300,status:'pending',counts:{blocked:1},expired:true}]},receipts:{status:'available',items:[]},limitations:[]};
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/balance-monitor')return route.fulfill({json:{intervalMinutes:60,threshold:5,connections:{dock:{balances:[{currency:'CNY',total:'4.20'}],checkedAt:'2026-11-10T09:00:00Z'}}}});
    if(url.pathname==='/api/dock-followup'){
      const body=route.request().postDataJSON();
      if(followupMode==='rate')return route.fulfill({json:{ok:false,error:'remote_rate_limited'}});
      if(followupMode==='quota')return route.fulfill({json:{ok:false,error:'remote_quota_exhausted'}});
      if(followupMode==='unknown')return route.fulfill({json:{ok:false,error:'send_outcome_unknown',status:'unknown',previewBlocked:true}});
      if(followupMode==='replayed')return route.fulfill({json:{ok:true,status:'accepted',replayed:true,previewBlocked:true,callbackBound:false}});
      return route.fulfill({json:body.action==='preview'?{ok:true,token:'test-token',batchCode:body.batchCode,senderLabel:'测试员工',chatLabel:'批次原会话',pendingCount:1,rows:[{sheet:'Sheet1',rowNumber:3,missing:['年级','地区']}]}:{ok:true,status:'accepted',callbackBound:true,delivery:'unverified'}});
    }
    if(url.pathname==='/api/dock-runtime') {
      if(route.request().method()==='POST') {
        const saved=route.request().postDataJSON().action==='save';
        return route.fulfill({json:{ok:true,message:saved?'配置已保存；尚未重启':'连接可用',saved}});
      }
      return route.fulfill({json:{ok:true,revision:'fixture-r1',service:{status:'Running'},groups:[{id:'bot',fields:[{key:'AFTB_APP_ID',label:'应用 ID',value:'test-app'},{key:'AFTB_APP_SECRET',label:'应用密钥',secret:true,configured:true}]},{id:'primary',fields:[{key:'AFTB_LLM_BASE_URL',label:'接口地址',value:'https://api.deepseek.com/v1'},{key:'AFTB_LLM_MODEL',label:'模型',value:'test-model'}]},{id:'fallback',fields:[]}]}});
    }
    if(url.pathname==='/api/prism-batch') {
      const body=route.request().method()==='POST'?route.request().postDataJSON():{action:'archive-inspect'};
      const data=body.action==='archive-inspect'?{batches:[{batchId:'c24967dd-8d0c-4441-8fcf-1f005e06e693',images:48,records:48,lastFetchedAt:'2026-11-09T21:00:25+08:00'}],latestBatchId:'c24967dd-8d0c-4441-8fcf-1f005e06e693'}:body.action==='archive-verify'?{batchId:body.batchId,checked:48,valid:48}: {batchId:body.batchId,total:48,completed:48,passed:48,failed:0,items:[],temporaryDatabaseDeleted:true};
      return route.fulfill({json:{schemaVersion:'1.0',ok:true,action:body.action,data,observedAt:'2026-11-10T08:33:31Z',productionTarget:{status:'unverified',writeEnabled:false}}});
    }
    if(url.pathname==='/api/dock-management') {
      reads++;
      if(fail)return route.fulfill({status:503,json:{error:'测试读取失败'}});
      if(url.searchParams.get('action')==='batch')return route.fulfill({json:{...fixture,batch:{status:'available',item:fixture.batches.items[0]},receipts:{status:'available',items:[{position:0,status:'success',outcome:'success',retryAllowed:false},{position:1,status:'failed',outcome:'failed_or_unknown',retryAllowed:false}],truncated:false}}});
      return route.fulfill({json:fixture});
    }
    if(['/api/state','/api/workspace','/api/dock-operations','/api/prism-operations','/api/sales-operations'].includes(url.pathname))return route.continue();
    return route.fulfill({json:{}});
  });
  await page.goto(base+'/#/p/bridge/w/batches');
  await page.locator('[data-dock-live="batch"][data-id="495C6AEC"]').waitFor();
  assert.ok(reads>0);
  await page.locator('[data-dock-live="batch"][data-id="495C6AEC"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-dock-batch-detail]')?.textContent.includes('495C6AEC'));
  assert.match(await page.locator('[data-dock-batch-detail]').innerText(),/失败|核对/);
  const followupBounds=await page.locator('[data-followup-action="preview"]').boundingBox();
  assert.ok(followupBounds.y>=0 && followupBounds.y+followupBounds.height<1000,'follow-up action must be visible without scrolling through receipts');
  assert.equal(await page.locator('[data-dock-batch-dialog]').evaluate(el=>el.open),true);
  assert.equal(await page.locator('[data-dock-live="followup"]').count(),2);
  assert.equal(await page.locator('[data-dock-live="batch"][aria-pressed="true"]').getAttribute('data-id'),'495C6AEC');
  assert.equal(await page.locator('.dock-batch-receipts').getAttribute('open'),null);
  await page.screenshot({path:join(dir,'dock-followup-ready-desktop.png'),fullPage:true});
  await page.locator('[data-followup-action="preview"]').click();
  await page.getByText('尚未发送',{exact:true}).waitFor();
  assert.match(await page.locator('[data-followup-preview]').innerText(),/第 3 行：年级、地区/);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-followup-action="send"]').click();
  await page.getByText('飞书已接受待补卡片。员工填写结果请在批次中重新读取。',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-followup-action="preview"]').isDisabled(),true);
    for(const mode of ['rate','quota','unknown','replayed']){
    followupMode=mode;
    await page.locator('[data-dock-live="close"]').click();
    await page.locator('[data-dock-live="followup"][data-id="495C6AEC"]').click();
    await page.locator('[data-followup-status]').filter({hasText:mode==='rate'?'限流':mode==='quota'?'额度已用尽':mode==='unknown'?'结果未知':'之前的发送回执'}).waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-dock-followup]')?.dataset.busy==='false');
    const text=await page.locator('[data-followup-status]').innerText();
      assert.match(text,mode==='rate'?/限流/:mode==='quota'?/额度已用尽/:mode==='unknown'?/结果未知/:/之前的发送回执/);
    assert.equal(await page.locator('[data-followup-action="send"]').count(),0);
      assert.equal(await page.locator('[data-followup-action="preview"]').isDisabled(),!['rate','quota'].includes(mode));
  }
  followupMode='normal';
  await page.locator('[data-dock-live="close"]').click();
  await page.locator('[data-dock-zoom]').fill('0');
  assert.equal(await page.locator('[data-dock-board]').getAttribute('data-density'),'timeline');
  await page.screenshot({path:join(dir,'dock-timeline.png'),fullPage:true});
  await page.locator('[data-dock-grain="week"]').click();
  assert.equal(await page.locator('[data-dock-grain="week"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-dock-zoom]').fill('75');
  await page.locator('[data-dock-grain="day"]').click();
  await page.locator('[data-dock-search]').fill('abcdef');
  assert.equal(await page.locator('[data-dock-live="batch"]:visible').count(),1);
  await page.locator('[data-dock-search]').fill('');
  await page.screenshot({path:join(dir,'dock-desktop.png'),fullPage:true});
  fail=true;
  await page.locator('[data-dock-live="refresh"]').click();
  await page.locator('[data-dock-management] [role="alert"]').waitFor();
  assert.equal(await page.locator('[data-dock-live="batch"]:visible').count(),2);
  fail=false;
  await page.locator('[data-dock-live="refresh"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-dock-management] [role="alert"]'));
  await page.goto(base+'/#/p/bridge/w/tables');
  await page.getByText('测试工作账号',{exact:true}).waitFor();
  assert.equal(await page.locator('.sales-tabs').count(),0);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(dir,'dock-mobile.png'),fullPage:true});
  assert.ok(await page.locator('[data-dock-management]').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.goto(base+'/#/p/bridge/w/runtime');
  await page.locator('[data-runtime-group="bot"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-runtime-balance]')?.textContent.includes('CNY 4.20'));
  const bot=page.locator('[data-runtime-group="bot"]');
  await bot.locator('input[name="AFTB_APP_SECRET"]').fill('fixture-only');
  await bot.locator('[data-runtime-action="test"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-group-feedback]')?.textContent.includes('测试完成'));
  assert.equal(await bot.locator('input[name="AFTB_APP_SECRET"]').inputValue(),'fixture-only');
  await bot.locator('[data-runtime-action="save"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-group-feedback]')?.textContent.includes('配置已保存'));
  assert.equal(await bot.locator('input[name="AFTB_APP_SECRET"]').inputValue(),'');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:join(dir,'runtime-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:join(dir,'runtime-desktop.png'),fullPage:true});
  await page.goto(base+'/#/p/prism/w/library');
  await page.locator('[data-prism-batch-select] option').waitFor({state:'attached'});
  await page.locator('[data-prism-batch-action="archive-verify"]').click();
  await page.getByText('48 / 48 张可解码',{exact:false}).waitFor();
  await page.locator('[data-prism-batch-action="batch-isolated-verify"]').click();
  await page.getByText('已处理 48 / 48 · 通过 48 · 失败 0').waitFor();
  await page.screenshot({path:join(dir,'prism-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(dir,'prism-mobile.png'),fullPage:true});
  assert.ok(await page.locator('[data-prism-batch-select]').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS: API boundaries; automatic load; batch lookup; filtering; stale/error recovery; account view; diagnosis; mobile layout');
  console.log(dir);
} finally {
  if(browser)await browser.close();
  if(server.exitCode===null){const exited=new Promise(r=>server.once('exit',r));server.kill();await exited;}
}
