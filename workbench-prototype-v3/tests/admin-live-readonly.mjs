// Read-only production connection check. All business mutations are blocked.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/YL-GHL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('**/api/**',route=>{
    const request=route.request();
    if(request.method()!=='GET'&&!request.url().endsWith('/business-snapshot'))return route.abort();
    return route.continue();
  });
  await page.goto('http://127.0.0.1:5185/#/p/sales/w/answer-lab');
  await page.locator('[data-library-kind]').waitFor();
  assert.equal(await page.locator('.library-heading [data-action="refresh"]').count(),0);
  await page.locator('[data-library-kind]').selectOption('reply');
  await page.locator('[data-business-editor]>summary').click();
  await page.locator('[data-action="business-install"]').waitFor({timeout:30000});
  await page.locator('[data-business-version]').selectOption('');
  const install=page.locator('[data-action="business-install"]');
  assert.equal(await install.isDisabled(),true);
  assert.equal(await install.getAttribute('title'),'请先保存新版本，再实装');
  assert.equal(await install.evaluate(el=>getComputedStyle(el).cursor),'default');
  assert.equal(await page.getByText('尚未连接提示词发布服务',{exact:true}).count(),0);
  console.log('PASS live prompt management connection; install not clicked');
  await page.goto('http://127.0.0.1:5185/#/p/sales/w/materials');
  await page.locator('[data-status]').filter({hasText:/\d+ 项物料/}).waitFor({timeout:30000});
  const count=await page.locator('.tm-row').count();
  if(count){
    await page.locator('.tm-row').first().click();
    assert.equal(await page.locator('[data-delete]').isEnabled(),true);
    assert.match(await page.locator('[data-detail] .tm-uploader').innerText(),/上传/);
  }
  await page.screenshot({path:'../workspace/tmp/admin-materials-live.png',fullPage:true});
  console.log(`PASS live materials: ${count} items; no mutation submitted`);
} finally {await browser.close();}
