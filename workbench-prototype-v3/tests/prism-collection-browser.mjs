import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.BUNDLED_NODE_MODULES + '/playwright');
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto((process.env.WORKBENCH_URL || 'http://127.0.0.1:5185') + '/#/p/prism');
  await page.getByRole('link', {name:/教学资料/}).waitFor();
  assert.equal(await page.getByRole('link', {name:/来源与同步|资料与入库/}).count(), 0);
  await page.getByRole('link', {name:/教学资料/}).click();
  await page.getByRole('heading',{name:'教学资料',exact:true}).waitFor();
  await page.getByText('准备下载图片',{exact:true}).click();
  await page.locator('[name="image-range"]').selectOption('custom');
  assert.equal(await page.locator('[name="image-since"]').isVisible(),true);
  await page.locator('[name="image-since"]').fill('2026-11-01');
  await page.getByText('准备下载笔记',{exact:true}).click();
  await page.getByRole('checkbox',{name:'素描',exact:true}).uncheck();
  await page.locator('[data-note-batch]').waitFor();
  assert.ok(await page.locator('[data-note-batch] option').count()>0);
  assert.equal(await page.getByRole('button',{name:'下载并整理笔记',exact:true}).isDisabled(),false);
  assert.equal(await page.getByRole('button',{name:'下载新增图片',exact:true}).isDisabled(),false);
  assert.equal(await page.locator('.prism-archive-advanced').count(),0);
  assert.equal(await page.getByText('重置迁移演练',{exact:true}).count(),0);
  assert.equal(await page.getByText('检查资料包',{exact:true}).count(),0);
  await page.waitForFunction(()=>document.querySelector('[data-prism-batch]')?.getAttribute('aria-busy') === 'false',null,{timeout:120000});
  assert.ok(await page.locator('[data-prism-batch-select] option').count() > 0);
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    await page.screenshot({path:join(tmpdir(),`prism-collection-${width}.png`),fullPage:true});
  }
  await page.goto((process.env.WORKBENCH_URL || 'http://127.0.0.1:5185') + '/#/p/prism/w/sources');
  await page.getByRole('heading',{name:'教学资料',exact:true}).waitFor();
  await page.goto((process.env.WORKBENCH_URL || 'http://127.0.0.1:5185') + '/#/sim');
  await page.getByRole('button',{name:'重置迁移演练',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: merged entry, legacy route, enabled download controls, historical notes, removed legacy tools, reset limited to simulation, desktop/mobile overflow; screenshots in TEMP');
} finally { await browser.close(); }
