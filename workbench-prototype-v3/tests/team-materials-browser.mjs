// Fully intercepted browser harness: no production requests or writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/YL-GHL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const js = await readFile(new URL('../src/ui/team-materials.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/ui/team-materials.css', import.meta.url), 'utf8');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    let mode = 'knownsuccess', failRead = false, gets = 0;
    const writes = [], errors = [], items = [{ id: 'first', title: '团队介绍', type: 'TEXT', content: '初始正文' }];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/module.js') return route.fulfill({ contentType: 'text/javascript', body: js });
      if (p === '/knowledge-navigation.js') return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../src/ui/knowledge-navigation.js',import.meta.url),'utf8')});
      if (p === '/api/team-materials/capabilities') return route.fulfill({json:{can_delete:true,uploaders:{first:{name:'测试工作机',identity_type:'device',person_name:null}}}});
      if (p === '/api/team-materials/delete') {
        const data=route.request().postDataJSON();
        if(mode==='knownsuccess')items.splice(items.findIndex(m=>m.id===data.id),1);
        return route.fulfill({json:{status:mode,id:data.id,deleted:mode==='knownsuccess'}});
      }
      if (p.endsWith('.css')) return route.fulfill({ contentType: 'text/css', body: css });
      if (p === '/') return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width, initial-scale=1"><body style="background:#161719"><h1 style="color:white">知识与物料</h1><main></main><script type="module">import {materialsWorkface,materialsMounted} from "/module.js";document.querySelector("main").innerHTML=materialsWorkface().body;materialsMounted();materialsMounted();</script>' });
      if (p.startsWith('/api/team-materials/images/')) return route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') });
      if (p === '/api/team-materials' && route.request().method() === 'GET') { gets++; return route.fulfill({ status: failRead ? 503 : 200, json: { materials: items, revision: 'r1' } }); }
      if (p === '/api/team-materials') {
        const data = route.request().postDataJSON(); writes.push(data);
        const material = { id: String(writes.length), title: data.title, content: data.content || '', type: data.base64 ? 'IMAGE' : 'TEXT' };
        if (mode === 'knownsuccess') items.push(material);
        return route.fulfill({ json: { status: mode, material } });
      }
      throw Error('Unexpected request: ' + p);
    });
    await page.goto('http://localhost/');
    await page.getByText('团队介绍', { exact: true }).waitFor();
    await page.getByText('上传来源：测试工作机（设备）',{exact:true}).waitFor();
    assert.equal(gets, 1); assert.equal(await page.locator('h1').count(), 1);
    await page.getByRole('searchbox').fill('不存在'); await page.getByText('暂无物料').waitFor();
    await page.getByRole('searchbox').fill('');
    failRead = true; await page.locator('[data-refresh]').click(); await page.getByText('读取失败，保留原列表').waitFor();
    assert.equal(await page.locator('.tm-row').count(), 1); failRead = false;
    await page.locator('[data-add]').click();
    await page.locator('[name=title]').fill('中文文本'); await page.locator('[name=content]').fill('中文正文');
    mode = 'knownfailure'; await page.locator('[type=submit]').click(); await page.getByText('上传已被拒绝，输入已保留。修改后可重新提交。').waitFor();
    assert.equal(await page.locator('[name=content]').inputValue(), '中文正文');
    mode = 'knownsuccess'; await page.locator('[name=title]').fill('修正文本'); await page.locator('[type=submit]').click();
    await page.getByText('修正文本', { exact: true }).waitFor(); assert.notEqual(writes[0].requestId, writes[1].requestId);
    await page.locator('[data-add]').click(); await page.locator('[name=title]').fill('图片素材'); await page.locator('[name=kind]').selectOption('image');
    await page.locator('[type=file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.locator('[data-preview]:visible').waitFor();
    await page.locator('[type=submit]').click(); await page.getByText('图片素材', { exact: true }).waitFor();
    assert.equal(writes[2].base64, png);
    await page.getByLabel('物料类型').selectOption('IMAGE'); assert.equal(await page.locator('.tm-row').count(), 1);
    await page.locator('.tm-row').click(); await page.waitForFunction(() => document.querySelector('[data-detail] img')?.naturalWidth > 0);
    page.on('dialog',dialog=>dialog.accept());
    mode='knownfailure';await page.locator('[data-delete]').click();await page.getByText('删除被拒绝，请核对管理服务连接').waitFor();
    mode='knownsuccess';await page.locator('[data-delete]').click();await page.getByText('已删除',{exact:true}).waitFor();
    assert.equal(await page.locator('.tm-row').count(),0);
    await page.locator('[data-detail] [data-close]').click();
    await page.locator('[data-add]').click(); await page.locator('[name=title]').fill('未知结果'); await page.locator('[name=content]').fill('保留输入');
    mode = 'unknown'; await page.locator('[type=submit]').click(); await page.getByText('上传结果未知，已禁止重复提交。输入已保留。').waitFor();
    assert.equal(await page.locator('[type=submit]').isDisabled(), true);
    await page.locator('form').evaluate(form => form.requestSubmit()); assert.equal(writes.length, 4);
    assert.equal(await page.locator('[name=content]').inputValue(), '保留输入');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS mocked browser ${width}px: list/filter/text/image/rejection/unknown`);
  }
} finally { await browser.close(); }
