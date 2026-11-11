import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/YL-GHL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();
 let deleted=0,accept=false;
 const versions=[{id:'saved',filename:'帮我回_测试版本.md',text:'Saved prompt'},{id:'active',filename:'生效版本.md',text:'Active prompt'}];
 const state=()=>({local:{builtin:'Builtin',versions},remote:{state:{activeId:'active',revision:1,versions},loaded:{}},connected:true});
 await page.route('**/api/knowledge/business-*',async route=>{
  if(route.request().url().endsWith('/business-delete')){
   assert.equal(route.request().postDataJSON().versionId,'saved');
   deleted++;versions.splice(0,1);
  }
  await route.fulfill({json:state()});
 });
 page.on('dialog',dialog=>accept?dialog.accept():dialog.dismiss());
 await page.goto('http://127.0.0.1:5185/#/p/sales/w/answer-lab');
 await page.locator('[data-library-kind]').selectOption('reply');
 await page.locator('[data-business-editor]>summary').click();
 const button=page.locator('[data-action="business-delete"]');
 assert.equal(await button.isDisabled(),true);
 await page.locator('[data-business-version]').selectOption('active');
 assert.equal(await button.isDisabled(),true);
 await page.locator('[data-business-version]').selectOption('saved');
 await button.click();
 assert.equal(deleted,0);
 accept=true;
 await button.click();
 await page.getByText('所选版本已删除',{exact:true}).waitFor();
 assert.equal(deleted,1);
 assert.equal(await page.locator('[data-business-version] option[value="saved"]').count(),0);
 assert.equal(await button.isDisabled(),true);
 console.log('PASS deletion UI: builtin/active protected, cancel preserved, confirmed deletion removes version');
} finally {await browser.close();}
