// Isolated module harness: every request is fulfilled locally; no production traffic.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/YL-GHL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const js=await readFile(new URL('../src/ui/knowledge-workface.js',import.meta.url),'utf8');
const css=await readFile(new URL('../src/ui/styles/knowledge-workface.css',import.meta.url),'utf8');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();let gets=0,queries=0,organizes=0;const writes=[];
 const doc={id:'draft',filename:'a.txt',title:'<unsafe>',state:'draft',revision:1,blocks:[{id:'b1',text:'original',source:'a.txt'}],scope:{confirmed:false}};
 const snapshot={version:7,documents:[doc,{...doc,id:'old',state:'active'},...['withdrawn','superseded'].map(state=>({...doc,id:state,state}))],history:[],environment:'local',modelConfigured:false};
 await page.route('**/*',async r=>{
  const path=new URL(r.request().url()).pathname;
  if(path==='/module.js')return r.fulfill({contentType:'text/javascript',body:js});
  if(path==='/style.css')return r.fulfill({contentType:'text/css',body:css});
  if(path==='/')return r.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/style.css"><script type="module">import {knowledgeWorkface,knowledgeMounted} from "/module.js";window.render=()=>{document.body.innerHTML=knowledgeWorkface();knowledgeMounted()};window.addEventListener("hashchange",window.render);window.render()</script>'});
  if(path==='/api/knowledge'){gets++;return r.fulfill({json:snapshot});}
  const payload=r.request().postDataJSON();writes.push({path,payload});
  if(path.endsWith('/query')){queries++;return r.fulfill({json:{version:7,mode:'retrieval',coverage:{truncated:true},matches:[{id:'b1',text:'real hit',title:'a',source:'a.txt'}],generationError:'model unavailable'}});}
  if(path.endsWith('/organize')){organizes++;return r.fulfill({json:{revision:1,suggestions:[{text:'organized',sourceBlockIds:['b1']}]}});}
  if(path.endsWith('/review')){assert.deepEqual(payload.blocks[0].sourceBlockIds,['b1']);doc.blocks=payload.blocks.map(b=>({...b,id:'saved',source:{filename:'a.txt',paragraph:3}}));doc.scope=payload.scope;doc.revision++;}
  return r.fulfill({json:doc});
 });
 await page.goto('http://knowledge.test/#/other');assert.equal(gets,0);
 await page.evaluate(()=>location.hash='#/p/sales/w/knowledge');
 await page.getByText('<unsafe>',{exact:true}).first().waitFor();
 await page.evaluate(()=>window.render());assert.equal(gets,1);
 assert.equal(await page.locator('.sales-tabs a').last().getAttribute('href'),'#/p/sales/w/materials');
 for(const id of ['old','withdrawn','superseded']){
  await page.locator(`[data-action=open][data-id=${id}]`).click();
  assert.equal(await page.locator('[data-block]').getAttribute('readonly'),'');
  assert.equal(await page.locator('[data-action=review], [data-action=publish], [data-action=organize]').count(),0);
 }
 await page.locator('[data-action=open][data-id=draft]').click();
 await page.locator('[data-block]').fill('unsaved');
 await page.locator('[data-action=organize]').click();
 await page.getByText('必须先保存或放弃未保存修改，再请求模型整理',{exact:true}).waitFor();assert.equal(organizes,0);
 await page.locator('[data-action=discard]').click();
 await page.locator('[data-action=organize]').click();
 await page.getByText('organized',{exact:false}).waitFor();assert.equal(organizes,1);assert.equal(doc.blocks[0].text,'original');
 await page.locator('[data-action=accept]').click();
 await page.locator('[data-action=review]').click();await page.getByText('必须确认内容及适用范围已审阅',{exact:true}).waitFor();
 await page.locator('[data-confirm]').check();await page.locator('[data-action=review]').click();
 await page.getByText('操作已成功',{exact:true}).waitFor();
 await page.getByText('a.txt · 段落 3',{exact:true}).waitFor();
 await page.locator('[data-action=publish]').click();await page.getByText('必须选择同名资料的替换对象',{exact:true}).waitFor();
 await page.locator('[data-replace]').selectOption('old');await page.locator('[data-action=publish]').click();
 await page.getByText('操作已成功',{exact:true}).waitFor();assert.equal(writes.find(w=>w.path.endsWith('/publish')).payload.replaceId,'old');
 assert.equal(writes.find(w=>w.path.endsWith('/publish')).payload.revision,2);
 await page.locator('[data-action=query]').click();await page.getByText('请输入问题',{exact:true}).waitFor();assert.equal(queries,0);
 await page.locator('[data-question]').fill('test question');await page.locator('[data-action=query]').click();
 await page.getByText('real hit',{exact:true}).waitFor();assert.equal(queries,1);assert.equal(await page.locator('[data-question]').inputValue(),'test question');
 await page.locator('[data-coverage-warning]').waitFor();
 const desktop=await page.evaluate(()=>{const root=getComputedStyle(document.querySelector('#knowledge-workface'));const a=document.querySelector('.knowledge-library').getBoundingClientRect(),b=document.querySelector('.knowledge-query').getBoundingClientRect();return {background:root.backgroundColor,padding:root.padding,fontSize:root.fontSize,columns:b.x>a.x&&Math.abs(a.y-b.y)<1};});
 assert.deepEqual(desktop,{background:'rgba(0, 0, 0, 0)',padding:'0px',fontSize:'16px',columns:true});
 await page.screenshot({path:process.env.TEMP+'/knowledge-desktop.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await page.evaluate(()=>document.querySelector('.knowledge-query').getBoundingClientRect().top>=document.querySelector('.knowledge-library').getBoundingClientRect().bottom),true);
 await page.screenshot({path:process.env.TEMP+'/knowledge-mobile.png'});
 console.log('PASS: route gating, review, organize approval, explicit replacement, query validation, retrieval fallback, mobile layout (mock only)');
}finally{await browser.close();}
