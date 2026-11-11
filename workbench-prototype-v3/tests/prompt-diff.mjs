import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {comparePrompts,promptDiffView} from '../src/ui/prompt-diff.js';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/YL-GHL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const pairs=[['',''],['','新增'],['删除',''],['同一段','同一段'],['帮助客户理解课程。','帮助客户选择课程。'],['甲\n乙\n丙\n','甲\n丙\n'],['甲\n丙\n','甲\n乙\n丙\n'],['你好😀\r\n','您好😀\n'],['甲'.repeat(6000),'乙'.repeat(6000)]];
for(const [before,after] of pairs){
 const diff=comparePrompts(before,after);
 assert.equal(diff.rows.map(r=>r.left).join(''),before);
 assert.equal(diff.rows.map(r=>r.right).join(''),after);
 for(const r of diff.rows.filter(r=>r.parts)){
  assert.equal(r.parts.filter(p=>!p.added).map(p=>p.value).join(''),r.left);
  assert.equal(r.parts.filter(p=>!p.removed).map(p=>p.value).join(''),r.right);
 }
}
assert.deepEqual(comparePrompts('帮助客户理解课程。','帮助客户选择课程。').counts,{add:0,remove:0,modify:1});
assert.match(promptDiffView({baseline:'<script>alert(1)</script>',candidate:'安全'}),/&lt;script&gt;/);
assert.doesNotMatch(promptDiffView({baseline:'<script>alert(1)</script>',candidate:'安全'}),/<script>/);
const baseline='共同开头\n共同背景\n帮助客户理解课程。\n共同约束\n共同格式\n共同结尾\n删除这一段\n';
const candidate='共同开头\n共同背景\n帮助客户选择课程。\n共同约束\n共同格式\n共同结尾\n新增这一段\n额外来源要求\n';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/diff-test',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><style>body{background:#090909;color:#eee;font:18px sans-serif;margin:32px}button{background:transparent;color:inherit;border:1px solid #777}summary{cursor:pointer}</style><link rel="stylesheet" href="/src/ui/styles/knowledge-workface.css"><main id="knowledge-workface"></main><script type="module">import {promptDiffView,handlePromptDiff} from '/src/ui/prompt-diff.js';document.querySelector('main').innerHTML=promptDiffView(${JSON.stringify({baseline,candidate})});document.addEventListener('click',handlePromptDiff);</script>`}));
 await page.goto('http://127.0.0.1:5185/diff-test');
 await page.locator('summary').click();
 assert.ok(await page.locator('ins').count()>0);
 assert.ok(await page.locator('del').count()>0);
 await page.getByRole('button',{name:'下一处差异'}).click();
 assert.equal(await page.locator('[data-diff-position]').textContent(),'1 / 3');
 await page.getByRole('button',{name:'上一处差异'}).click();
 assert.equal(await page.locator('[data-diff-position]').textContent(),'3 / 3');
 await page.getByRole('checkbox',{name:'只看差异'}).check();
 assert.equal(await page.locator('[data-diff-kind="same"][data-diff-context="false"]:visible').count(),0);
 await page.getByRole('checkbox',{name:'只看差异'}).uncheck();
 await page.screenshot({path:process.env.TEMP+'/prompt-diff-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:process.env.TEMP+'/prompt-diff-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS prompt diff reconstruction, Chinese edits, add/delete, escaping, long-text fallback, navigation, filter, desktop/mobile');
}finally{await browser.close();}
