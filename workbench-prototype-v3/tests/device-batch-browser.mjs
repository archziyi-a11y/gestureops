import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/YL-GHL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const devices=[
  {id:'new-phone',label:'新版工作机',online:true,workClientVersion:'1.0.0.708',apps:[]},
  {id:'old-phone',label:'旧版工作机',online:true,workClientVersion:'1.0.0.703',upgradeBlock:'work_client_upgrade_required',apps:[{name:'SASALELE v30',status:'安装超时'}]},
  {id:'offline',label:'离线工作机',online:false,workClientVersion:'1.0.0.708',apps:[]}
 ];
 let uploads=0,starts=0,submitted,installCalls=0;
 await page.route('**/api/work-devices**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let data;
  if(path.endsWith('/releases')){uploads++;assert.equal(starts,0);data={releaseId:'release-test',versionCode:40,versionName:'test',bytes:1000};}
  else if(path.endsWith('/batches')){
   if(route.request().method()==='POST'){starts++;submitted=route.request().postDataJSON();data={id:'batch-test',state:'running',results:[]};}
   else data=[];
  }else if(path.includes('/batches/'))data={id:'batch-test',state:'completed',results:[{deviceId:'new-phone',state:'accepted_not_verified'}]};
  else if(path.endsWith('/actions')){if(route.request().method()==='POST')installCalls++;data=[];}
  else if(path.endsWith('/apps'))data={apps:[]};
  else data={devices,observedAt:new Date().toISOString(),authorization:{expiresEpoch:1799745585}};
  await route.fulfill({json:data});
 });
 await page.goto('http://127.0.0.1:5185/#/p/sales/w/devices');
 await page.getByText('本期授权将于',{exact:false}).waitFor();
 assert.match(await page.locator('.device-authorization-notice').innerText(),/2027年1月12日/);
 await page.locator('[data-device="upgrade"][data-id="old-phone"]').click();
 await page.getByRole('heading',{name:'请先升级手机端后台'}).waitFor();
 assert.equal(installCalls,0);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'批量更新',exact:true}).click();
 await page.locator('.device-batch-targets').waitFor();
 assert.equal(await page.locator('.device-batch-targets input:checked').count(),1);
 assert.equal(await page.locator('.device-batch-targets input:disabled').count(),2);
 // Exercise actual drop handling rather than setting form state directly.
 await page.locator('[data-drop]').evaluate(el=>{
  const transfer=new DataTransfer();transfer.items.add(new File(['test-apk-fixture'],'sales-test.apk',{type:'application/octet-stream'}));
  el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
 });
 await page.getByText('安装包检查通过。',{exact:false}).waitFor();
 assert.equal(uploads,1);assert.equal(starts,0,'upload must not dispatch');
 await page.getByRole('button',{name:'确认更新 1 台'}).click();
 await page.getByRole('heading',{name:'本批下发结束'}).waitFor();
 assert.equal(starts,1);assert.deepEqual(submitted.deviceIds,['new-phone']);
 await page.screenshot({path:'C:/Users/YL-GHL/AppData/Local/Temp/device-batch-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.querySelector('dialog').getBoundingClientRect().width<=window.innerWidth),true);
 await page.screenshot({path:'C:/Users/YL-GHL/AppData/Local/Temp/device-batch-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log('device batch browser: expiry, old-client hint, real drop, selection, confirm and results PASS (mock API only)');
} finally {await browser.close();}
