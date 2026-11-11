import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.BUNDLED_NODE_MODULES+'/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5185/#/asset/reports');
 await page.locator('.report-task').first().waitFor({timeout:60000});
 assert.ok(await page.locator('.report-task').count()>0);
 assert.equal(await page.locator('.report-evidence').getAttribute('open'),null);
 await page.locator('.report-task summary').first().click();
 assert.ok(await page.locator('.report-task[open] code').first().isVisible());
 assert.equal(await page.locator('.pagehead .sub').textContent(),'日报生成、员工提醒与主管汇总');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:join(tmpdir(),`report-details-${width}.png`),fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS live report rows, disclosure, desktop/mobile, no script errors');
}finally{await browser.close();}
