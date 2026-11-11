import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/YL-GHL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  let submissions=[], reads=0; const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/work-devices**',async route=>{
    const url=new URL(route.request().url());
    let body;
    if(url.pathname.endsWith('/apps'))body={apps:[{id:'app-test',name:'SASALELE test',fingerprint:'fp-test'}]};
    else if(url.pathname.endsWith('/actions')){
      if(route.request().method()==='POST'){
        const data=route.request().postDataJSON();
        submissions.push({...data,state:'accepted_not_verified',createdAt:new Date().toISOString()});
        body=submissions.at(-1);
      }else body=submissions;
    }else {reads++;body={observedAt:new Date().toISOString(),devices:[{id:'device-test',label:'测试工作机',model:'test',online:true,apps:[],lastReport:Date.now(),workClientVersion:'1.0'}]};}
    await route.fulfill({json:body});
  });
  await page.goto('http://127.0.0.1:5185/#/p/sales/w/devices');
  await page.getByRole('button',{name:'更新',exact:true}).waitFor();
  assert.equal(reads,1,'initial entry refreshes automatically');
  await page.locator('[data-device-search]').fill('测试');
  assert.equal(reads,1,'search redraw does not refresh');
  await page.getByRole('button',{name:'更新',exact:true}).click();
  await page.locator('dialog [name=app]').selectOption('app-test');
  await page.getByRole('button',{name:'确认更新',exact:true}).click();
  await page.locator('dialog [data-result]').filter({hasText:'已下发'}).waitFor();
  assert.equal(submissions.length,1);assert.equal(submissions[0].action,'upgrade');
  assert.equal(submissions[0].deviceId,'device-test');
  assert.ok(await page.locator('dialog [data-submit]').isDisabled());
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'配置工作机',exact:true}).click();
  await page.locator('dialog [name=device]').selectOption('device-test');
  await page.locator('dialog [name=app]').selectOption('app-test');
  assert.match(await page.locator('dialog').innerText(),/手机内导入团队配置/);
  await page.getByRole('button',{name:'下发安装',exact:true}).click();
  await page.locator('dialog [data-result]').filter({hasText:'待导入团队配置'}).waitFor();
  assert.equal(submissions.length,2);assert.equal(submissions[1].action,'install');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{location.hash='#/p/sales';});
  await page.locator('.device-table').waitFor({state:'detached'});
  await page.evaluate(()=>{location.hash='#/p/sales/w/devices';});
  await page.waitForFunction(()=>!document.querySelector('[data-device="refresh"]')?.disabled);
  await page.getByRole('button',{name:'更新',exact:true}).waitFor();
  assert.equal(reads,2,'returning to the page refreshes once');
  await page.getByRole('button',{name:'刷新',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('[data-device="refresh"]')?.disabled);
  assert.equal(reads,3,'manual refresh remains available');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'C:/Users/YL-GHL/AppData/Local/Temp/work-device-actions.png'});
  console.log('device actions browser: update/configuration flow passed (mock provider, no real device writes)');
} finally {await browser.close();}
