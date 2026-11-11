import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.BUNDLED_NODE_MODULES + '/playwright');
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto('http://127.0.0.1:5185/#/p/prism');
  const link = page.getByRole('link',{name:'打开 Prism（本地）'});
  await link.waitFor();
  assert.equal(await link.getAttribute('target'),'_blank');
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(new URL(popup.url()).port,'4173');
  assert.match(await popup.title(),/Prism/i);
  assert.equal(page.url(),'http://127.0.0.1:5185/#/p/prism');
  assert.equal(await popup.evaluate(()=>window.opener),null);
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await link.isVisible());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:join(tmpdir(),`prism-entry-${width}.png`)});
  }
  console.log('PASS local Prism popup, original page preserved, no opener, desktop/mobile layout');
} finally { await browser.close(); }
