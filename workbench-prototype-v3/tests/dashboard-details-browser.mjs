import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.BUNDLED_NODE_MODULES+'/playwright');
const fixtures=[
 ['application','renderApplicationDetails',{id:'prism',fact:'图片采集待补，笔记预览可用',sections:[{title:'图片采集',text:'最近单群补采完成；全群结果另行记录'},{title:'教学笔记',text:'本地预览可用'}],alerts:['部分图片待补'],source:'隔离测试'}],
 ['data-asset','renderDataAssetDetails',{id:'images',status:'observed',fact:'教研图片集',dataAsset:{total:40,images:30,media:{readable:28,checked:30,failed:2}}}],
 ['data-asset','renderDataAssetDetails',{id:'sales-sources',status:'observed',fact:'销售知识资料',dataAsset:{total:12,pending:3}}],
 ['geo','renderGeoDetails',{id:'geo',fact:'最近批次有稿件待处理',geo:{task:{state:'Ready',result:0},batch:{date:'2026-11-11',dryRun:false},gates:{passed:2,total:3},outputs:{nonEmpty:3,total:3},currentReceipt:false}}],
 ['portrait','renderPortraitDetails',{id:'portraits',fact:'同步任务已结束，本地副本存在',portrait:{task:{state:'Ready',account:'fixture',result:0},file:{state:'present',size:1024,mtime:'2026-11-11T08:00:00Z'},association:'configured-target'}}],
 ['infra','renderInfraDetails',{id:'bots',fact:'1 项运行，1 项停止',infra:{items:[{businessName:'对接表消息机器人',name:'AFTB-Bot',state:'running',stateLabel:'运行中',raw:'Running'},{businessName:'日报与汇总机器人',name:'PXKB-Bot',state:'stopped',stateLabel:'已停止',raw:'Stopped'}]}}],
 ['infra','renderInfraDetails',{id:'n8n',fact:'容器运行，就绪检查未通过',infra:{items:[],readiness:{state:'not_ready',httpStatus:503}}}]
];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://dashboards.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const match=path.match(/^\/(geo|portrait|infra|application|data-asset)-details\.(js|css)$/);
  const file=match?match[1]==='application'&&match[2]==='css'?'../styles/application-details.css':`../src/ui/${match[2]==='css'?'styles/':''}${match[1]}-details.${match[2]}`:null;
  await route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html',body:file?await readFile(new URL(file,import.meta.url),'utf8'):'<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#101214;color:#eee;font-family:sans-serif;margin:0;padding:24px;box-sizing:border-box}*{box-sizing:border-box}</style><div id="host"></div>'});
 });
 for(const [type,fn,card] of fixtures){
  await page.goto('http://dashboards.test/');
  await page.evaluate(async({type,fn,card})=>{const link=document.createElement('link');link.rel='stylesheet';link.href=`/${type}-details.css`;document.head.append(link);const module=await import(`/${type}-details.js`);module[fn](document.querySelector('#host'),card);},{type,fn,card});
  assert.equal(await page.locator('h2').innerText(),card.fact);
  assert.equal(await page.locator('details[open]').count(),0);
  await page.locator('summary').last().click();assert.equal(await page.locator('details[open]').count(),1);
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});
   await page.screenshot({path:join(tmpdir(),`dashboard-${card.id}-${width}.png`),fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${card.id} overflow at ${width}`);
  }
 }
 await page.route('http://integration.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/src/ui/styles/')&&path.endsWith('.css')&&!path.includes('..')||path==='/styles/application-details.css')return route.fulfill({contentType:'text/css',body:await readFile(new URL('..'+path,import.meta.url),'utf8')});
  if(path==='/api/card-observations')return route.fulfill({json:{cards:fixtures.filter(x=>!['sales-sources'].includes(x[2].id)).map(x=>x[2])}});
  if(path==='/api/knowledge/source-snapshot')return route.fulfill({json:{total:12,pending:3,updatedAt:'2026-11-11T08:00:00Z'}});
  if(path.startsWith('/src/ui/')&&path.endsWith('.js')&&!path.includes('..')||path==='/src/domain/asset-catalog.js')return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('..'+path,import.meta.url),'utf8')});
  const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
  return route.fulfill({contentType:'text/html',body:`<meta name="viewport" content="width=device-width,initial-scale=1">${index.match(/<link[^>]+rel="stylesheet"[^>]*>/g).join('')}<main id="host"></main>`});
 });
 await page.goto('http://integration.test/');
 for(const [type,,card] of fixtures.filter(x=>x[2].id!=='sales-sources')){
 await page.evaluate(async({id})=>{
  location.hash=`#/asset/${id}`;
  const {createWorkspaceViews}=await import('/src/ui/workspace-views.js');
  const views=createWorkspaceViews({state:{task:[],projects:[],compositions:{}},preview:null});
  document.querySelector('#host').innerHTML=views.workspaceDetail();
  const {cardObservationsMounted}=await import('/src/ui/card-observations.js');cardObservationsMounted();
 },{id:card.id});
 await page.waitForSelector(type==='data-asset'?`[data-live-card="${card.id}"] .data-asset-details`:`[data-live-card="${card.id}"].${type}-details`);
 assert.equal(await page.locator(`[data-live-card="${card.id}"] h2`).innerText(),card.fact);
 assert.equal(await page.locator('[data-ws="return-grid"]').count(),1);
 }
 await page.evaluate(async()=>{
  location.hash='#/asset/sales-sources';
  const {createWorkspaceViews}=await import('/src/ui/workspace-views.js');
  document.querySelector('#host').innerHTML=createWorkspaceViews({state:{task:[],projects:[],compositions:{}},preview:null}).workspaceDetail();
  const {sourceAssetMounted}=await import('/src/ui/source-library.js');sourceAssetMounted();
 });
 await page.waitForSelector('[data-source-asset-details] .data-asset-details');
 assert.match(await page.locator('[data-source-asset-details]').innerText(),/12 份/);
 assert.match(await page.locator('[data-source-asset-details]').innerText(),/3 份/);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  const values=page.locator('.data-asset-details dd');
  for(const item of await values.all())assert.ok((await item.boundingBox()).width>150,`readable value width at ${width}`);
  const countBox=await values.first().boundingBox();
  assert.ok(countBox.height<50,`short count must fit on one line at ${width}`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:join(tmpdir(),`dashboard-sources-integrated-${width}.png`),fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('PASS dashboard browser: GEO, portrait, Bot, n8n, Prism, images, sources; disclosure; desktop/mobile');
}finally{await browser.close();}
