import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {readLocalCards} from '../src/domain/local-card-observations.js';

const root=await mkdtemp(join(tmpdir(),'jyq-details-'));
try{
 const dir=join(root,'corpus_raw/crm/ifangzhou/jyq/_meta');await mkdir(dir,{recursive:true});
 await writeFile(join(dir,'last_result.json'),JSON.stringify({status:'success',scope:'room',rooms:['测试群'],finished_at:'2026-11-11T10:00:00+08:00',counts:{assets_new:0},failed_by_stage:{network:0,secret_stage:99},secret:'SECRET_SENTINEL',resume_reason:{reason:'SECRET_SENTINEL'}}));
 const {cards}=await readLocalCards({root,dependencies:{execFile:async()=>{throw Error('offline');}}});
 const card=cards[0];assert.equal(card.status,'unknown');assert.equal(card.jyq.task,null);assert.equal(card.jyq.receipt.scope,'room');
 assert.equal(card.jyq.receipt.assetsNew,0);assert.equal(card.jyq.receipt.assetsFilled,null);assert.equal(card.jyq.receipt.pendingInScope,null);
 assert.ok(!JSON.stringify(card).includes('SECRET_SENTINEL'));assert.ok(!JSON.stringify(card).includes('secret_stage'));
 if(process.env.BUNDLED_NODE_MODULES){
  const require=createRequire(import.meta.url);const {chromium}=require(process.env.BUNDLED_NODE_MODULES+'/playwright');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
   const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://jyq.test/**',async route=>{const path=new URL(route.request().url()).pathname;const body=path==='/jyq.js'?await readFile(new URL('../src/ui/jyq-details.js',import.meta.url),'utf8'):path==='/jyq.css'?await readFile(new URL('../src/ui/styles/jyq-details.css',import.meta.url),'utf8'):'<link rel="stylesheet" href="/jyq.css"><div id="host"></div>';await route.fulfill({status:200,contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html',body});});
   await page.goto('http://jyq.test/');await page.evaluate(async c=>{const m=await import('/jyq.js');m.renderJyqDetails(document.querySelector('#host'),c);},card);
   assert.match(await page.locator('#host').innerText(),/单群补采：完成/);assert.match(await page.locator('#host').innerText(),/补齐 未知/);
   assert.equal(await page.locator('details').getAttribute('open'),null);await page.locator('summary').click();assert.equal(await page.locator('details').getAttribute('open'),'');
   for(const width of [1440,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
   assert.deepEqual(errors,[]);console.log('browser: passed');
  }finally{await browser.close();}
 }else console.log('browser: skipped (BUNDLED_NODE_MODULES not set)');
 console.log('jyq details: offline passed');
}finally{await rm(root,{recursive:true,force:true});}
