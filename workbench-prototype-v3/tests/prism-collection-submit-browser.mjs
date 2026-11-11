import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.BUNDLED_NODE_MODULES+'/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage();let jobs=[],posts=[];
  await page.route('**/api/prism-collection',async route=>{
    if(route.request().method()==='POST'){
      const body=route.request().postDataJSON();posts.push(body);
      jobs=[{id:'test',kind:body.kind,status:'running',stage:'正在下载',createdAt:new Date().toISOString()}];
      return route.fulfill({json:{job:jobs[0]},status:202});
    }
    return route.fulfill({json:{jobs,archives:[]}});
  });
  await page.goto('http://127.0.0.1:5185/#/p/prism/w/library');
  await page.getByText('准备下载笔记',{exact:true}).click();
  for(const label of ['色彩','素描','速写'])await page.getByRole('checkbox',{name:label,exact:true}).uncheck();
  await page.getByRole('button',{name:'下载并整理笔记',exact:true}).click();
  assert.equal(posts.length,0);
  await page.getByText('请至少选择一个科目',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'素描',exact:true}).check();
  await page.getByRole('button',{name:'下载并整理笔记',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-collect="notes"]').disabled);
  assert.deepEqual(posts,[{kind:'notes',subjects:['sketch']}]);
  await page.reload();
  await page.getByText('准备下载笔记',{exact:true}).click();
  await page.getByText('正在采集 · 正在下载',{exact:true}).waitFor();
  jobs[0]={...jobs[0],status:'partial',message:'部分完成',completedAt:new Date().toISOString(),counts:{documentsExported:2,errors:1}};
  await page.getByText('部分完成 · 部分完成',{exact:true}).waitFor({timeout:10000});
  assert.equal(posts.length,1);
  assert.equal(await page.getByRole('button',{name:'下载并整理笔记',exact:true}).isDisabled(),false);
  console.log('PASS browser mocked: required subjects, selected payload, running lock, reload, partial result, no duplicate submission');
}finally{await browser.close();}
