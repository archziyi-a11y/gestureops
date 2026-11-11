// Local workbench shell with intercepted library APIs: no provider or production writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/YL-GHL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.emulateMedia({reducedMotion:'reduce'});
    const errors = [];
    let comparisons = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/knowledge', route => route.fulfill({ json: { version: 0, documents: [], history: [], modelConfigured: false } }));
    await page.route('**/api/knowledge/query', async route => {
      comparisons++;
      const body=route.request().postDataJSON();
      assert.equal(body.compare,true);
      await new Promise(resolve=>setTimeout(resolve,120));
      return route.fulfill({ json: {
        comparison:true, question:body.query, model:'test-model', scope:{}, startedAt:'2026-11-09T10:00:00+00:00',
        baseline:comparisons===1?{answer:'需要向学校确认课程安排。'}:{generationError:'回答生成失败，未自动重试'},
        augmented:{version:0,answer:'合成资料规定每周两次课，每次九十分钟。',citations:['b1'],matches:[{id:'b1',title:'合成课程资料',source:'sample.md#block-1',text:'每周两次课，每次九十分钟。'}]}
      } });
    });
    await page.route('**/api/team-materials**', route => route.fulfill({ json: { materials: [{ id: 'sample', title: '团队介绍', type: 'TEXT', content: '测试资料' }] } }));
    await page.goto('http://127.0.0.1:5185/#/p/sales/w/knowledge');
    await page.getByText('本地版本 0', { exact: true }).waitFor();
    await page.locator('[data-question]').fill('课程如何安排？');
    await page.locator('[data-action=query]').click();
    await page.getByRole('heading',{name:'回答对比',exact:true}).waitFor();
    assert.equal(comparisons,1);
    await page.getByText('不使用知识库',{exact:true}).waitFor();
    await page.locator('.comparison-sources summary').click();
    await page.getByText('回答已引用 · sample.md#block-1',{exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:join(tmpdir(),'knowledge-comparison-'+width+'.png'),fullPage:true});
    await page.locator('[data-question]').fill('换一个问题');
    await page.locator('[data-action=query]').click();
    await page.getByText('回答生成失败，未自动重试',{exact:true}).waitFor();
    assert.equal(await page.locator('.comparison-question').textContent(),'换一个问题');
    assert.equal(await page.locator('.comparison-answer').count(),1,'Keep the successful side');
    await page.evaluate(()=>window.scrollTo(0,0));
    const before = await page.locator('.sales-tabs').boundingBox();
    const heading = await page.locator('.library-heading').boundingBox();
    await page.screenshot({ path: join(tmpdir(), 'libraries-knowledge-' + width + '.png'), fullPage: true });
    await page.getByRole('link', { name: '团队物料', exact: true }).click();
    await page.getByText('团队介绍', { exact: true }).waitFor();
    const after = await page.locator('.sales-tabs').boundingBox();
    const nextHeading = await page.locator('.library-heading').boundingBox();
    assert.ok(Math.abs(before.y - after.y) < 1, 'Tab row must stay fixed across switching');
    assert.ok(Math.abs(before.x - after.x) < 1, 'Tab alignment must stay fixed');
    assert.ok(Math.abs(heading.y - nextHeading.y) < 1, 'Section headings must align');
    assert.equal(await page.locator('.sales-tabs a').first().textContent(), '模型知识');
    if (width > 600) {
      const search = await page.getByRole('searchbox').boundingBox();
      const filter = await page.getByLabel('物料类型').boundingBox();
      assert.ok(Math.abs(search.y - filter.y) < 1, 'Search and filter share a row');
      assert.ok(search.width <= 360, 'Search must not stretch across the page');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
    await page.screenshot({ path: join(tmpdir(), 'libraries-materials-' + width + '.png'), fullPage: true });
    await page.getByRole('link', { name: '模型知识', exact: true }).click();
    await page.getByText('本地版本 0', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS library switching and layout at ' + width + 'px');
    await page.close();
  }
} finally {
  await browser.close();
}
