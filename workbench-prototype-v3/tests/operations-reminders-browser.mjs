import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { createOperationsReminders } from '../src/domain/operations-reminders.js';
import { createJobRecords } from '../src/domain/job-records.js';
const require=createRequire(import.meta.url);
const {chromium}=require(join(process.env.BUNDLED_NODE_MODULES,'playwright'));
const dir=mkdtempSync(join(tmpdir(),'workbench-reminders-browser-'));
const incidents=createOperationsReminders({dir});
const jobs=createJobRecords({dir});
await jobs.run({area:'devices',action:'submit'},async()=>({state:'accepted_not_verified'}));
await jobs.run({area:'materials',action:'delete'},async()=>({status:'unknown'}));
await incidents.run({area:'materials',action:'delete',object:'fixture'},async()=>({status:'unknown'}));
await incidents.run({area:'model',action:'test',target:'sales'},async()=>({connected:false}));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=spawn(process.execPath,['server.js'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,STATE_DIR:dir,PORT:String(port),BALANCE_MONITOR_DISABLED:'1'},stdio:'ignore'});
let browser;
try {
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const facts={
      '/api/sales-runtime':{windowStart:'2026-11-10T00:00:00Z',windowEnd:'2026-11-10T02:00:00Z',items:['帮我回','润色','销售指导','profile'].map(kind=>({kind,active:0,succeeded:kind==='帮我回'?2:0,failed:0,cached:0,failures:[]}))},
      '/api/card-observations':{cards:[{id:'jyq',fact:'最近采集已结束',detail:'调度回执为 0',source:'测试调度器',observedAt:'2026-11-10T02:00:00Z',status:'observed'}]},
      '/api/work-devices':{devices:[{online:true,workClientVersion:'1.0.0.703',apps:[{status:'安装超时'}]},{online:false,apps:null}],observedAt:'2026-11-10T02:00:00Z'},
      '/api/knowledge':{version:3,documents:[{state:'active'},{state:'draft'}]},
      '/api/team-materials':{materials:[{type:'IMAGE'},{type:'TEXT'}]},
    };
    if(facts[path])return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(facts[path])});
    if(['/api/state','/api/workspace','/api/operations-reminders','/api/health','/api/job-records'].includes(path))return route.continue();
    return route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });
  await page.goto(base+'/#/asset/sales');
  await page.locator('.ops-issue').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-sales-status="devices"]')?.textContent.includes('2 台工作机'));
  await page.waitForFunction(()=>document.querySelector('[data-sales-runtime]')?.textContent.includes('成功 2'));
  assert.match(await page.locator('[data-sales-runtime]').innerText(),/近期无请求/);
  assert.match(await page.locator('[data-sales-runtime]').innerText(),/画像同步/);
  await page.locator('[data-sales-runtime]').scrollIntoViewIfNeeded();
  await page.screenshot({path:join(dir,'runtime-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-sales-runtime]').scrollIntoViewIfNeeded();
  await page.screenshot({path:join(dir,'runtime-mobile.png')});
  await page.setViewportSize({width:1440,height:1000});
  assert.match(await page.locator('[data-sales-status="devices"]').innerText(),/1 台在线 · 1 台离线/);
  assert.match(await page.locator('[data-sales-description="devices"]').innerText(),/安装超时 1 台/);
  await page.waitForFunction(()=>document.querySelector('[data-sales-status="knowledge"]')?.textContent.includes('版本 3'));
  assert.match(await page.locator('[data-sales-status="knowledge"]').innerText(),/已发布 1 份/);
  await page.waitForFunction(()=>document.querySelector('[data-sales-status="materials"]')?.textContent.includes('2 项团队物料'));
  assert.equal(await page.locator('.ops-issue').count(),2);
  assert.ok((await page.locator('[data-operations-reminders]').innerText()).includes('拖到右侧'));
  const issue=page.locator('.ops-issue').first();
  await issue.focus();await page.keyboard.press('Alt+ArrowRight');
  await page.waitForFunction(()=>document.querySelector('.ws-inspection .ws-task.has-content'));
  if(!await page.locator('.ws-inspection [data-ws="preview-task"]').isVisible())await page.locator('.ws-inspection [data-ws="toggle-task"]').click();
  await page.locator('.ws-inspection [data-ws="preview-task"]').click();
  await page.locator('#ws-preview').waitFor();
  assert.ok((await page.locator('#ws-preview').inputValue()).includes('结果待核对'));
  await page.locator('[data-ws="close-preview"]').click();
  await page.locator('.ops-issue').last().focus();await page.keyboard.press('Alt+ArrowRight');
  await page.waitForTimeout(200);
  assert.equal((await (await fetch(base+'/api/workspace')).json()).workspace.task.length,1);
  await page.reload();await page.locator('.ops-issue').first().waitFor();
  assert.ok(await page.locator('.ws-inspection .ws-task.has-content').isVisible());
  if(!await page.locator('.ws-inspection [data-ws="remove-task"]').isVisible())await page.locator('.ws-inspection [data-ws="toggle-task"]').click();
  await page.locator('.ws-inspection [data-ws="remove-task"]').click();
  await page.waitForFunction(()=>!document.querySelector('.ws-inspection .ws-task.has-content'));
  // Exercise native drag events through the existing edge receiver, not a direct API call.
  const transfer=await page.evaluateHandle(()=>new DataTransfer());
  await page.locator('.ops-issue').first().dispatchEvent('dragstart',{dataTransfer:transfer});
  const edge=page.locator('.ws-inspection .ws-edge-right');
  assert.ok(await edge.isVisible());
  await edge.dispatchEvent('dragover',{dataTransfer:transfer});
  await edge.dispatchEvent('drop',{dataTransfer:transfer});
  await page.waitForFunction(()=>document.querySelector('.ws-inspection .ws-task.has-content'));
  await page.locator('.ws-inspection [data-ws="remove-task"]').click();
  await page.waitForFunction(()=>!document.querySelector('.ws-inspection .ws-task.has-content'));
  await page.waitForTimeout(400);
  await page.screenshot({path:join(dir,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(300);
  await page.screenshot({path:join(dir,'mobile.png'),fullPage:true});
  assert.ok(await page.locator('.ops-issue').first().evaluate(el=>el.getBoundingClientRect().right<=innerWidth && el.getBoundingClientRect().left>=0));
  await page.goto(base+'/#/records');
  await page.waitForFunction(()=>document.querySelector('[data-job-records]')?.textContent.includes('安装待确认'));
  assert.match(await page.locator('[data-job-records]').innerText(),/结果未知/);
  assert.match(await page.locator('summary').filter({hasText:'历史模拟演练'}).innerText(),/历史模拟演练/);
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('[data-job-records]')?.textContent.includes('安装待确认'));
  await page.screenshot({path:join(dir,'records-mobile.png'),fullPage:true});
  await page.goto(base+'/#/asset/jyq');
  await page.waitForFunction(()=>document.querySelector('[data-live-card="jyq"]')?.textContent.includes('最近采集已结束'));
  assert.equal(await page.locator('.ws-detail-facts').filter({hasText:'11月6日运行失败'}).count(),0);
  await page.waitForTimeout(500);
  await page.screenshot({path:join(dir,'card-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:join(dir,'card-desktop.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: isolated incidents, severity ordering, keyboard handoff, drag receiver, conflict retention, reload persistence, responsive layout');
  console.log(dir);
} finally { if(browser)await browser.close();const exit=new Promise(r=>server.once('exit',r));server.kill();await exit; }
