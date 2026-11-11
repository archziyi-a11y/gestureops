import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.BUNDLED_NODE_MODULES + '/playwright');
const server = createServer(async (req, res) => {
  res.setHeader('content-type','text/html; charset=utf-8');
  if (req.url === '/prism-batch.js') {
    res.setHeader('content-type','text/javascript');
    res.end(await readFile(new URL('../src/ui/prism-batch.js', import.meta.url)));
  } else res.end('<meta charset="utf-8"><main></main><script type="module">import {initPrismBatch,prismBatchView,prismBatchMounted} from "/prism-batch.js"; function render(){document.querySelector("main").innerHTML=prismBatchView({advanced:true});prismBatchMounted()} window.renderBatch=render; initPrismBatch({notify:()=>{}});render();</script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({channel:'chrome', headless:true});
try {
  const page = await browser.newPage();
  const errors = [], calls = [];
  page.on('pageerror', e => errors.push(e.message));
  let fail = false;
  await page.route('**/api/prism-batch**', async route => {
    const action = route.request().method() === 'GET' ? 'archive-inspect' : route.request().postDataJSON().action;
    calls.push(action);
    const batchId = route.request().method() === 'POST' ? route.request().postDataJSON().batchId : null;
    const data = action === 'archive-inspect' ? {batches:[{batchId:'a',images:2,records:2,lastFetchedAt:'2026-11-10T10:00:00+08:00'},{batchId:'b',images:1,records:1,lastFetchedAt:'2026-11-09T10:00:00+08:00'}],latestBatchId:'a'} : action === 'archive-verify' ? {batchId,checked:2,valid:1} : action === 'batch-isolated-verify' ? {batchId,total:2,completed:2,passed:1,failed:1,items:[{index:1,ok:false,error:'OSError'}],temporaryDatabaseDeleted:true} : {accepted:true,duplicate:true,authorizedRead:true,unauthorizedDenied:true,mediaMatched:true};
    await route.fulfill({json:{schemaVersion:'1.0',ok:!fail,action,data,observedAt:'2026-11-10T02:00:00Z'}});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByText('2 条归档记录 · 2 张图片').waitFor();
  assert.deepEqual(calls,['archive-inspect']);
  await page.getByText('图片完整性与隔离入库验证', {exact:true}).click();
  await page.getByRole('button',{name:'检查媒体完整性'}).click();
  await page.getByText('1 / 2 张可解码', {exact:false}).waitFor();
  await page.getByRole('button',{name:'验证整批（本地隔离）'}).click();
  await page.getByText('已处理 2 / 2 · 通过 1 · 失败 1').waitFor();
  await page.getByText('第 2 项：OSError').waitFor();
  await page.locator('select').selectOption('b');
  assert.equal(await page.getByText('已处理 2 / 2 · 通过 1 · 失败 1').count(),0);
  await page.getByText('高级检查', {exact:true}).click();
  await page.getByRole('button',{name:'验证首张图片（本机临时库）'}).click();
  await page.getByText('单张真实样本通过', {exact:false}).waitFor();
  fail = true;
  await page.getByRole('button',{name:'刷新批次'}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('select').inputValue(),'b');
  fail = false;
  const inspections = calls.filter(action => action === 'archive-inspect').length;
  await page.evaluate(() => window.renderBatch());
  await page.waitForFunction(() => !document.querySelector('[data-prism-batch]').matches('[aria-busy="true"]'));
  assert.equal(calls.filter(action => action === 'archive-inspect').length, inspections + 1);
  fail = true;
  await page.reload();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByText('归档暂无批次。', {exact:true}).count(), 0);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:process.env.TEMP + '/prism-batch-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Browser mocked contract: auto-load, decode, full batch failure, selection, single image, retry failure passed');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
