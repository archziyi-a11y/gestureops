import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readSupportCards} from '../src/domain/support-card-observations.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.BUNDLED_NODE_MODULES+'/playwright');
const cards=(await readSupportCards({root:'.',balance:{connections:{sales:{balances:[{currency:'CNY',total:0}],checkedAt:'2026-11-11T08:00:00Z'},knowledge:{error:'private'}}},inspect:async()=>({isFile:()=>true})})).cards;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://support.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const file=path==='/module.js'?'../src/ui/support-details.js':path==='/style.css'?'../src/ui/styles/support-details.css':null;
  await route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html',body:file?await readFile(new URL(file,import.meta.url),'utf8'):'<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#101214;color:#eee;font-family:sans-serif;padding:24px}</style><link rel="stylesheet" href="/style.css"><div id="host"></div>'});
 });
 await page.goto('http://support.test/');
 for(const card of cards){
  await page.evaluate(async card=>{const {renderSupportDetails}=await import('/module.js');renderSupportDetails(document.querySelector('#host'),card);},card);
  assert.equal(await page.locator('.support-row').count(),3);
  assert.equal(await page.locator('details').getAttribute('open'),null);
  if(card.id==='connections'){
   assert.match(await page.locator('#host').innerText(),/¥0.00/);
   assert.match(await page.locator('#host').innerText(),/查询失败/);
   assert.match(await page.locator('#host').innerText(),/对接表主模型/);
  }
  await page.locator('summary').click();assert.equal(await page.locator('details').getAttribute('open'),'');
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(tmpdir(),`support-${card.id}-${width}.png`),fullPage:true});}
 }
 assert.deepEqual(errors,[]);console.log('PASS support detail rows, zero/unknown, disclosure, desktop/mobile');
}finally{await browser.close();}
