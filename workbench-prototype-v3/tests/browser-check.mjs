// 真浏览器点验：用无头 Chrome 按用户要求的那条路径点一遍，看的是点完之后真的发生了什么。
// 自动启动独立服务与临时数据；不连接用户演示服务。
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = Number(process.env.CDP_PORT || 9341);
if (process.env.BASE) throw new Error('浏览器验收只允许独立临时数据服务，不接受 BASE');
const portProbe = createServer();
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const BASE = `http://127.0.0.1:${port}/`;
const STATE_DIR = mkdtempSync(join(tmpdir(), 'yili-v31-browser-'));
const server = spawn(process.execPath, ['server.js'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, PORT: String(port), STATE_DIR },
  stdio: 'ignore'
});
process.on('exit', () => { server.kill(); chrome.kill(); });
const SHOTS = join(STATE_DIR, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

let pass = 0;
const failures = [];
const consoleErrors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ok = (n) => {
  pass += 1;
  console.log(`  PASS  ${n}`);
};
const fail = (n, d) => {
  failures.push(`${n}${d ? ' — ' + d : ''}`);
  console.log(`  FAIL  ${n}${d ? '\n        ' + d : ''}`);
};

const profile = mkdtempSync(join(tmpdir(), 'yili-v3-chrome-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-gpu',
    '--remote-allow-origins=*',
    '--no-proxy-server',
    '--proxy-bypass-list=*',
    '--window-size=1440,1080',
    'about:blank'
  ],
  { stdio: 'ignore' }
);

async function waitJson(path, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}${path}`);
      if (res.ok) return await res.json();
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method === 'Input.dragIntercepted') {
        this.dragData = msg.params.data;
      } else if (msg.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result.value;
  }
}

const main = async () => {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(BASE + 'api/health')).ok; } catch {}
    if (ready) break;
    await sleep(100);
  }
  if (!ready) throw new Error('隔离验收服务未就绪');
  console.log(`隔离数据与证据: ${STATE_DIR}`);
  const targets = await waitJson('/json/list');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  });

  const goto = async (hash) => {
    await cdp.send('Page.navigate', { url: BASE + hash });
    for (let i = 0; i < 90; i += 1) {
      await sleep(100);
      const s = await cdp.evaluate(
        'document.readyState + "|" + (!!document.querySelector(".shell"))'
      );
      if (s === 'complete|true') {
        await sleep(260);
        return;
      }
    }
    throw new Error(`页面未就绪: ${hash}`);
  };

  const reload = async () => {
    await cdp.send('Page.reload');
    for (let i = 0; i < 90; i += 1) {
      await sleep(100);
      const s = await cdp.evaluate('document.readyState + "|" + (!!document.querySelector(".shell"))');
      if (s === 'complete|true') {
        await sleep(300);
        return;
      }
    }
    throw new Error('刷新未完成');
  };

  const body = () => cdp.evaluate('document.body.innerText');
  const text = (sel) => cdp.evaluate(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`);
  const exists = (sel) => cdp.evaluate(`!!document.querySelector(${JSON.stringify(sel)})`);
  const click = async (sel, wait = 460) => {
    const r = await cdp.evaluate(
      `(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return 'MISSING'; if(el.disabled) return 'DISABLED'; el.click(); return 'OK';})()`
    );
    if (r !== 'OK') throw new Error(`点击失败(${r}): ${sel}`);
    await sleep(wait);
  };
  const shot = async (name) => {
    const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = join(SHOTS, `${name}.png`);
    writeFileSync(file, Buffer.from(res.data, 'base64'));
    return file;
  };

  // ---------- 1. 顶层仪表盘：左右切项目 ----------
  console.log('\n[1] 顶层仪表盘 · 左右切项目');
  await goto('#/');
  const first = await text('.identity .h1');
  check(first === '销售助手', `初始项目是销售助手（实际 ${first}）`);
  await shot('01-dashboard');

  await click('.switch__btn[data-project-id="prism"]');
  const second = await text('.identity .h1');
  check(second !== first, `点右箭头后项目变了（${first} → ${second}）`);
  check((await body()).includes('采集、入库与教师可用性尚未贯通观测'), 'Prism 不用合成采集结果冒充实时状态');
  check(await cdp.evaluate('document.querySelectorAll(".sales-area").length === 4'), 'Prism 分开来源、完整性、权限与消费');
  await click('.switch__btn[data-project-id="bridge"]');
  check((await body()).includes('等待对接表 Agent 的只读观测'), '对接表不以演练状态冒充真实观测');
  check((await body()).includes('Excel 导入与待补') && (await body()).includes('录入回执与待核对结果'), '对接表覆盖批次与实际写入回执');
  await click('.switch__btn[data-project-id="prism"]');
  check(!(await body()).includes('已切到'), '项目切换成功不重复显示提示');

  await click('.switch__btn[data-project-id="sales"]');
  const third = await text('.identity .h1');
  check(third === '销售助手', `点左箭头切回销售助手（实际 ${third}）`);

  // 服务与产出必须是两条事实
  const facts = await cdp.evaluate(
    `Array.from(document.querySelectorAll('.sales-area h3')).map(e=>e.innerText).join('|')`
  );
  check(facts.includes('设备授权') && facts.includes('销售指导') && facts.includes('跟进') && facts.includes('知识灰度'), '销售助手覆盖实际四类业务');
  check((await text('.sales-status')).includes('尚未接入'), '不以演练数字冒充销售助手实时状态');
  check(!(await text('.watch-panel')).includes('进入操作台'), '巡视主体没有操作入口');
  check(await text('.nav a[href="#/grid"]') === '总览', '导航按用途命名为总览');
  check(!(await exists('.watch-navigation a[href="#/grid"]')), '仪表盘底部没有重复总览入口');
  check(await cdp.evaluate('!document.querySelector(".watch-panel .switch") && !!document.querySelector(".watch-navigation .switch")'), '切换控件位于主体外');

  // ---------- 2. 四宫格 → 销售助手 ----------
  console.log('\n[2] 四宫格 → 点销售助手');
  await goto('#/grid');
  check(await exists('.ws-new'), '第四格是新项目草稿入口');
  await shot('02-grid');
  check(await cdp.evaluate(`!document.querySelector('[data-project-open="sales"] button') && !document.querySelector('[data-project-open="sales"] a')`), '项目卡没有查看、组装、操作台按钮');
  await click('[data-project-open="sales"]');
  check((await text('.pagehead .h1')) === '销售助手', '进入销售助手操作台');
  const markedFaces = await cdp.evaluate(`Array.from(document.querySelectorAll('.face')).filter(e=>e.querySelector('.chip')).map(e=>e.innerText)`);
  check(markedFaces.length === 0, '维护入口不携带模拟生产告警');
  check(await cdp.evaluate(`document.querySelectorAll('.sales-faces .face').length===4`), '销售助手按四个实际工作面组织');
  check(!(await body()).includes('鉴权失败'), '产出未观测不被编造成鉴权失败');

  // ---------- 3. 部署与迁移 ----------
  console.log('\n[3] 操作台 → 部署与迁移');
  await click('a.face[href="#/p/sales/migrate"]');
  await goto('#/p/sales/migrate-demo');
  check((await body()).includes('准备一次隔离迁移'), '进入迁移准备页');
  const stageChip = () => text('.pagehead .chip');
  check((await stageChip()).includes('待检查'), `初始是待检查（实际 ${await stageChip()}）`);
  await shot('03-migrate-initial');

  // ---------- 4. 选目标与凭据引用 ----------
  console.log('\n[4] 选目标和凭据引用');
  await click('[data-call="set_target"][data-target="isl-03"]');
  check((await body()).includes('isl-03 · 北京隔离区'), '目标切到了 isl-03');
  await click('[data-call="set_credential"][data-ref-id="local-key-ref-03"]');
  check((await body()).includes('local-key-ref-03'), '凭据引用切到了 local-key-ref-03');
  check((await text('#migration-handoff')).includes('北京'), '目标选择原位更新交接草稿');
  check((await text('#migration-handoff')).includes('未签发'), '草稿不冒充已签发交接包');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  check(await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth'), '窄屏迁移页没有横向溢出');
  const unblocked = await cdp.evaluate(`(()=>{const e=document.querySelector('[data-call="set_credential"][data-ref-id="local-key-ref-03"]');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===top || e.contains(top)})()`);
  check(unblocked, '窄屏凭据控件中心未被底栏遮挡');
  await shot('03-mobile-draft');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  // ---------- 5. 没检查就不能授权 ----------
  console.log('\n[5] 未检查时授权按钮是灰的');
  const authDisabled = await cdp.evaluate(
    `(()=>{const b=document.querySelector('[data-call="authorize"]'); return b? b.disabled : null})()`
  );
  check(authDisabled === true || authDisabled === null, `未检查不能授权（隐藏或禁用，disabled=${authDisabled}）`);

  // ---------- 6. 检查 → 授权 → 生成并复制提示词 ----------
  console.log('\n[6] 检查 → 授权 → 复制提示词');
  await click('[data-call="run_check"]', 700);
  check((await stageChip()).includes('待授权'), `检查通过后是待授权（实际 ${await stageChip()}）`);

  await click('[data-call="authorize"]', 700);
  check((await stageChip()).includes('已授权'), `授权后是已授权（实际 ${await stageChip()}）`);
  await shot('04-authorized');

  await cdp.evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('acceptance clipboard rejection'); } } })`);
  await click('[data-call="build_prompt"]', 900);
  check((await body()).includes('手动复制'), '剪贴板失败明确提示手动复制');
  check(await cdp.evaluate('location.hash === "#/p/sales/migrate-demo"'), '生成交接内容不跳离当前迁移页');
  check((await body()).includes('复制不是派发'), '落到交接页，页面明说复制不是派发');
  const stageAfterCopy = await text('.pagehead .chip');
  check(stageAfterCopy.includes('待接手'), `复制之后仍是待接手（实际 ${stageAfterCopy}）`);
  check(!stageAfterCopy.includes('已接手（模拟）'), '复制没有被写成已接手');
  check((await text('.prompt')).includes('校验块'), '提示词里有回执校验块');
  check((await text('.prompt')).includes('isl-03'), '提示词带当前目标');
  const originalPrompt = await text('.prompt');
  await click('[data-call="copy_prompt"]');
  check((await text('.prompt')) === originalPrompt, '复制失败重试不重新签发交接包');
  check((await stageChip()).includes('待接手'), '复制失败重试仍待接手');
  await reload();
  check((await stageChip()).includes('待接手') && (await text('.prompt')) === originalPrompt, '刷新保留服务端交接包与待接手事实');
  await shot('05-handoff-copied');

  // ---------- 7. 错配回执 ----------
  console.log('\n[7] 先试着导入一份错配回执');
  await click('[data-sample="wrong-job"]', 500);
  await click('[data-call="import_receipt"]', 700);
  const afterWrong = await text('.pagehead .chip');
  check(afterWrong.includes('待接手'), `错配回执被拦下，仍是待接手（实际 ${afterWrong}）`);
  check((await body()).includes('作业编号不一致'), '页面写出了拒绝原因');

  // ---------- 8. 匹配回执 ----------
  console.log('\n[8] 导入匹配的模拟回执');
  await click('[data-sample="matched"]', 500);
  await click('[data-call="import_receipt"]', 800);
  const afterRight = await text('.pagehead .chip');
  check(afterRight.includes('已接手'), `匹配回执把作业推进到已接手（实际 ${afterRight}）`);
  await shot('06-handoff-accepted');

  // ---------- 9. 换目标 → 旧授权失效 ----------
  console.log('\n[9] 换目标，看旧授权是不是真的失效');
  await goto('#/p/sales/migrate-demo');
  await click('[data-call="set_target"][data-target="isl-01"]', 700);
  const afterTarget = await text('.pagehead .chip');
  check(afterTarget.includes('待检查'), `换目标后回到待检查（实际 ${afterTarget}）`);
  check((await body()).includes('旧检查与授权失效') || (await body()).includes('最近变化'), '页面给出了失效提示');
  check((await body()).includes('尚未授权'), '授权卡回到尚未授权');
  await shot('07-invalidated');

  // ---------- 10. 刷新 / 重开仍然看得到 ----------
  console.log('\n[10] 刷新之后事实还在');
  await reload();
  const afterReloadChip = await text('.pagehead .chip');
  check(afterReloadChip.includes('待检查'), `刷新后仍是待检查（实际 ${afterReloadChip}）`);
  check((await body()).includes('尚未授权'), '刷新后仍显示未授权');

  await goto('#/records');
  const log = await body();
  check(log.includes('变更迁移目标'), '记录里有「变更迁移目标」');
  check(log.includes('旧检查与授权失效'), '记录里有「旧检查与授权失效」');
  check(log.includes('收到接手回执'), '记录里有「收到接手回执」');
  check(log.includes('回执未通过校验'), '记录里留下了被拦下的回执');
  const rows = await cdp.evaluate('document.querySelectorAll(".table--log tbody tr").length');
  check(rows >= 8, `记录条数合理（${rows} 条）`);
  await shot('08-records');

  // ---------- 空间工作台 ----------
  await goto('#/grid');
  check(await cdp.evaluate('getComputedStyle(document.querySelector(".ws-task")).visibility === "hidden"'), '空处理区平时隐藏');
  check(await cdp.evaluate('document.querySelectorAll(".ws-asset").length === 12'), '资产目录六类十二项');
  check(await cdp.evaluate(`!document.querySelector('.ws-asset button,.ws-asset input,.ws-selection button')`), '资产卡与选择栏无重复按钮或复选框');
  await click('.ws-asset[data-asset="images"]');
  await click('.ws-asset[data-asset="deploy"]');
  check(await cdp.evaluate(`!document.querySelector('.ws-selection,.ws-asset.is-selected,.ws-asset[aria-pressed]')`), '点击资产不建立多选状态');
  await drag('.ws-asset[data-asset="images"]','.ws-project[data-target="sales"]');
  check((await text('.ws-composition')).includes('教研图片集')&&!(await text('.ws-composition')).includes('销售助手部署资料'), '拖动只携带当前资产');
  await drag('.ws-asset[data-asset="deploy"]','.ws-composition');
  check((await text('.ws-composition')).includes('教研图片集')&&(await text('.ws-composition')).includes('销售助手部署资料'), '逐张拖入仍可组装多个资产');
  await cdp.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  check(await cdp.evaluate(`!document.querySelector('.ws-composition')`), 'Esc 关闭组装浮层');
  await click('.ws-asset[data-asset="images"]');
  await click('.ws-assets>header h2');
  check(await cdp.evaluate(`!document.querySelector('.ws-asset.is-selected')`), '资产与空白点击均不产生选中高亮');
  await drag('.ws-asset[data-asset="jyq"]','.ws-task');
  await drag('.ws-asset[data-asset="reports"]','.ws-task');
  check((await text('#toast')).includes('单独处理'), '未知等级问题冲突有明确反馈');
  check(await cdp.evaluate('document.querySelectorAll(".ws-task li").length === 1'), '冲突不清空或混装原问题');
  await drag('.ws-asset[data-asset="deploy"]','.ws-task');
  check(await cdp.evaluate('document.querySelectorAll(".ws-task li").length === 2'), '问题可附带部署资料');
  await click('[data-ws="preview-task"]');
  check((await cdp.evaluate('document.querySelector("#ws-preview").value')).includes('AGENTS.md'), '预览附带接手索引');
  await click('[data-ws="close-preview"]');
  // Denied clipboard must never report success; restore the native method afterwards.
  await cdp.evaluate('window.originalClipboard=navigator.clipboard.writeText.bind(navigator.clipboard);window.originalExec=document.execCommand; navigator.clipboard.writeText=async()=>{throw Error("denied")};document.execCommand=()=>false');
  await click('[data-ws="copy-task"]');
  check((await text('#toast')).includes('复制失败'), '复制失败不显示成功');
  await cdp.evaluate('navigator.clipboard.writeText=window.originalClipboard;document.execCommand=window.originalExec');
  await cdp.send('Browser.grantPermissions',{origin:new URL(BASE).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  await cdp.send('Page.bringToFront');
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await click('[data-ws="copy-task"]');
  check((await text('#toast')).includes('任务上下文已复制到剪贴板'), `真实剪贴板成功后 Toast（${await text('#toast')}）`);
  check(await cdp.evaluate('document.querySelectorAll(".ws-task li").length === 2'), '复制保留卡片');
  await reload();
  check(await cdp.evaluate('document.querySelectorAll(".ws-task li").length === 2'), '刷新保留处理上下文');
  await drag('.ws-asset[data-asset="jyq"]','.ws-edge-left');
  check((await body()).includes('2026-11-06 21:00:01'), '详细仪表盘包含历史证据而非实时断言');
  check(!(await exists('.ws-edge-left')), '详情页不保留左侧接收区');
  check(await cdp.evaluate(`fetch('/api/workspace').then(r=>r.json()).then(j=>j.workspace.inspecting===null)`), '查看对象不写入持久托盘');
  await click('[data-ws="return-grid"]');
  check(await cdp.evaluate(`getComputedStyle(document.querySelector('.ws-edge-left')).visibility==='hidden' && !document.querySelector('.ws-edge-left button')`), '返回总览侧光隐藏且无重复按钮');
  await click('.ws-asset[data-asset="images"]');
  const beforeEditorGrid=await cdp.evaluate(`document.querySelector('.ws-projects').getBoundingClientRect().height`);
  await click('[data-ws="open-compose"][data-target="new"]');
  check(await cdp.evaluate(`getComputedStyle(document.querySelector('.ws-composition')).position==='fixed' && !document.querySelector('.ws-project .ws-composition')`), '组装编辑使用独立浮层');
  check(await cdp.evaluate(`document.querySelector('.ws-projects').getBoundingClientRect().height`)===beforeEditorGrid, '打开新建编辑不改变网格高度');
  check(await cdp.evaluate(`document.querySelectorAll('.ws-composition-assets li').length===0`), '新建草稿不携带先前点击过的资产');
  await drag('.ws-asset[data-asset="images"]','.ws-composition');
  check(await cdp.evaluate(`(()=>{const h=document.querySelector('.ws-composition-heading h2'),row=document.querySelector('.ws-composition-assets li');return h.textContent==='新项目草稿' && parseFloat(getComputedStyle(h).fontSize)>parseFloat(getComputedStyle(row).fontSize);})()`), '项目标题与资产条目具有独立层级');
  await shot('new-project-heading');
  await cdp.evaluate(`(()=>{const n=document.querySelector('[data-ws-field="name"]');n.value='资料试验项目';n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(500);
  await click('[data-ws="save-compose"]');
  check(!(await exists('.ws-composition')), '新项目保存成功后退出组装层');
  check((await body()).includes('资料试验项目'), '新项目草稿实际保存');
  check(await cdp.evaluate(`document.querySelector('.ws-projects').dataset.columns==='3'`), '四个项目加新建入口自动进入三列');
  check(await cdp.evaluate(`Math.abs(document.querySelector('.ws-new').getBoundingClientRect().width-document.querySelector('[data-project-open]').getBoundingClientRect().width)<2`), '新建入口仅占一个网格');
  await reload();
  check((await body()).includes('资料试验项目'), '刷新保留项目草稿');
  // HTML drag events exercise the same production handlers, with a real DataTransfer.
  async function drag(source,target){
    await cdp.evaluate(`(()=>{const s=document.querySelector(${JSON.stringify(source)}),t=document.querySelector(${JSON.stringify(target)}),d=new DataTransfer();s.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:d}));t.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:d}));t.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:d}));s.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:d}));})()`);
    await sleep(600);
  }
  await drag('.ws-asset[data-asset="n8n"]','.ws-project[data-target="sales"]');
  check((await text('.ws-composition')).includes('n8n'), '资产拖入已有项目显示组合层');
  await shot('09-workspace-composition');
  check(!(await exists('[data-ws="close-compose"],[data-ws="add-compose"]')), '无顶部收起与加入所选入口');
  await cdp.evaluate(`document.querySelector('.ws-composition textarea').value='保存当前组装目标'`);
  await click('[data-ws="save-compose"]');
  check(!(await exists('.ws-composition')) && (await text('#toast')).includes('草稿已保存'), '已有项目保存成功后退出组装层');
  check(await cdp.evaluate(`fetch('/api/workspace').then(r=>r.json()).then(j=>j.workspace.compositions.sales.description==='保存当前组装目标')`), '保存草稿真实写入当前表单内容');
  await drag('.ws-asset[data-asset="images"]','.ws-edge-left');
  check((await text('.ws-detail')).includes('教研图片集'), '左侧 drop 后进入详情');
  await goto('#/grid');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await shot('10-workspace-mobile');
  check(await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth'), '窄屏无页面横向溢出');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await shot('11-workspace-wide');
  await cdp.evaluate('document.querySelector(".ws-asset[data-asset=portraits]").scrollIntoView({block:"center",inline:"center"})');
  await sleep(400);
  await cdp.send('Input.setInterceptDrags',{enabled:true});
  const points=await cdp.evaluate(`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+45}};return {from:rect('.ws-asset[data-asset="portraits"]'),to:rect('.ws-edge-right')};})()`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...points.from});
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...points.from,button:'left',clickCount:1});
  for(let step=1;step<=15;step++){
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.from.x+(points.to.x-points.from.x)*step/15,y:points.from.y+(points.to.y-points.from.y)*step/15,button:'left',buttons:1});
    await sleep(35);
  }
  if(cdp.dragData){
    await cdp.send('Input.dispatchDragEvent',{type:'dragEnter',...points.to,data:cdp.dragData});
    await cdp.send('Input.dispatchDragEvent',{type:'dragOver',...points.to,data:cdp.dragData});
    await cdp.send('Input.dispatchDragEvent',{type:'drop',...points.to,data:cdp.dragData});
  }
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...points.to,button:'left',clickCount:1});
  await cdp.send('Input.setInterceptDrags',{enabled:false});
  await sleep(600);
  check(!!cdp.dragData && (await text('.ws-task')).includes('销售助手画像'), `鼠标发起原生拖放到处理区（原生数据=${!!cdp.dragData}）`);
  await shot('12-native-drag-result');
  for (const columns of [2,3,4]) {
    await click(`[data-ws="density"][data-value="${columns}"]`);
    const fits=await cdp.evaluate(`(()=>{const grid=document.querySelector('.ws-projects');return getComputedStyle(grid).gridTemplateColumns.split(' ').length===${columns} && grid.scrollWidth<=grid.clientWidth;})()`);
    check(fits, `宽屏总览可排 ${columns} 列且不溢出`);
  }
  await reload();
  check(await cdp.evaluate(`document.querySelector('[data-ws="density"][data-value="4"]').getAttribute('aria-pressed')==='true' && document.querySelector('.ws-projects').dataset.effectiveColumns==='4'`), '刷新保留密度选择');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(250);
  check(await cdp.evaluate(`document.querySelector('.ws-projects').dataset.effectiveColumns==='1' && document.documentElement.scrollWidth<=innerWidth`), '手选四列在窄屏安全减列');
  await click('[data-ws="open-compose"][data-target="new"]');
  await shot('13-density-mobile-editor');
  check(await cdp.evaluate(`(()=>{const r=document.querySelector('.ws-composition').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight})()`), '窄屏浮层完整位于视口内');
  await cdp.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await click('[data-ws="density"][data-value="auto"]');
  // Populate only the test server, never the user's demo data.
  await cdp.evaluate(`(async()=>{let s=(await (await fetch('/api/workspace')).json()).workspace;const act=async a=>{const r=await (await fetch('/api/workspace',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...a,version:s.version})})).json();if(!r.ok)throw Error(r.message);s=r.workspace;};for(let i=0;i<11;i++){await act({type:'compose',target:'new'});await act({type:'compose-edit',target:'new',field:'name',value:'密度测试项目 '+(i+1)});await act({type:'project-save'});}})()`);
  await reload();
  check(await cdp.evaluate(`document.querySelectorAll('.ws-projects>.ws-project').length===16 && document.querySelector('.ws-projects').dataset.effectiveColumns==='4'`), '含新建入口十六项自动四列');
  await shot('14-density-sixteen');
  const deletedId=await cdp.evaluate(`document.querySelector('[data-project-open^="draft-"]').dataset.projectOpen`);
  await click(`[data-project-open="${deletedId}"]`);
  await cdp.evaluate(`window.confirm=message=>{window.deletePrompt=message;return false;}`);
  await click('[data-ws="delete-project"]');
  check(await exists(`[data-project-open="${deletedId}"]`), '取消删除保留项目草稿');
  check(await cdp.evaluate(`window.deletePrompt.includes('不删除关联资产') && window.deletePrompt.includes('不可撤销')`), '删除确认明确范围与不可撤销');
  await cdp.evaluate(`window.confirm=()=>true`);
  await click('[data-ws="delete-project"]');
  check(!(await exists(`[data-project-open="${deletedId}"]`)) && !(await exists('.ws-composition')), '确认删除后移除草稿并关闭编辑器');
  await reload();
  check(await cdp.evaluate(`(async()=>{const s=(await (await fetch('/api/workspace')).json()).workspace;return !s.projects.some(p=>p.id===${JSON.stringify(deletedId)}) && !s.compositions[${JSON.stringify(deletedId)}] && document.querySelectorAll('.ws-asset').length===12;})()`), '刷新后草稿及组装记录已删除，资产目录保留');
  // ---------- 11. 控制台干净 ----------
  await goto('#/p/sales/w/devices');
  await cdp.evaluate(`document.querySelector('[name="label"]').value='测试工作机';document.querySelector('[name="account"]').value='账号A';document.querySelector('form[data-sales-form]').requestSubmit()`);
  await sleep(500);
  check((await body()).includes('待签发'), '工作机申请保持待签发，不假装授权完成');
  await reload();
  check((await body()).includes('测试工作机'), '申请刷新后保留');
  await click('[data-sales="cancel"]');
  check((await body()).includes('已取消'), '未签发申请可以取消');
  await goto('#/p/sales/w/knowledge');
  const upload = async content => {
    await cdp.evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(content)}],'知识测试.md',{type:'text/markdown'}));document.querySelector('[name="source"]').files=dt.files;document.querySelector('form[data-sales-form]').requestSubmit()})()`);
    await sleep(500);
  };
  await upload('测试知识第一版');
  check((await body()).includes('待整理'), '上传创建真实本地批次，不宣称已发布');
  await upload('测试知识第一版');
  check((await text('#toast')).includes('相同内容'), '重复内容拒绝重复入库');
  await upload('测试知识第二版');
  check((await body()).includes('待确认版本关系'), '同名不同内容必须确认版本关系');
  await click('[data-sales="replace"]');
  check((await body()).includes('替换旧版'), '保存替换关系，不覆盖原文');
  await click('[data-sales="prepare"]');
  check((await body()).includes('待智能体整理'), '整理任务等待接手，不虚构整理结果');
  await shot('sales-knowledge-desktop');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await shot('sales-knowledge-mobile');
  check(await cdp.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), '知识页面手机宽度不溢出');
  await goto('#/p/sales/w/materials');
  await cdp.evaluate(`document.querySelector('[name="title"]').value='测试物料';document.querySelector('[name="content"]').value='物料内容';document.querySelector('form').requestSubmit()`);
  await sleep(500);
  check((await body()).includes('测试物料'), '团队物料单独准备');
  await goto('#/p/sales/w/runtime');
  await cdp.evaluate(`document.querySelector('[name="detail"]').value='手机无法读取物料';document.querySelector('form').requestSubmit()`);
  await sleep(500);
  check((await body()).includes('待智能体接手'), '运行排查保存独立任务');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await goto('#/p/prism');
  check(await cdp.evaluate(`document.querySelectorAll('.prism-face').length===4`), 'Prism 四工作面入口');
  await shot('prism-console');
  await click('a.prism-face[href="#/p/prism/w/library"]');
  const prismManifest={schema:'workbench-prism-index-v1',source:'本地整理',items:[{ref:'browser-note',title:'测试教学资料',kind:'source_note',subject:'色彩',authorRef:'test-teacher',mediaExpected:2,mediaAvailable:1}]};
  await cdp.evaluate(`(()=>{document.querySelector('[name="name"]').value='浏览器测试批次';const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(JSON.stringify(prismManifest))}],'index.json',{type:'application/json'}));document.querySelector('[name="file"]').files=dt.files;document.querySelector('[data-prism-form]').requestSubmit()})()`);
  await sleep(600);
  check((await body()).includes('图片存在缺口'), '资料清单展示媒体缺口');
  check((await body()).includes('尚无入库回执'), '本地检查不冒充平台入库');
  await click('[data-prism="prepare"]');
  check(await exists('[data-prism="copy"]'), '有缺口的批次生成核对任务');
  await reload();
  check((await body()).includes('浏览器测试批次'), 'Prism 批次与交接刷新后保留');
  await shot('prism-batch');
  await cdp.evaluate(`(async()=>{const s=(await (await fetch('/api/prism-operations')).json()).operations,b=s.batches[0];const receipt={schema:'workbench-prism-receipt-v1',batchId:b.id,digest:b.digest,stage:'ingestion',result:'partial',observedAt:'2026-11-07T12:00:00+08:00',actorRef:'test',resourceRef:'test-note',evidence:'isolated browser test'};const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(receipt)],'receipt.json',{type:'application/json'}));document.querySelector('details:has([data-prism-form])').open=true;document.querySelector('[name="file"]').files=dt.files;document.querySelector('[data-prism-form]').requestSubmit()})()`);
  await sleep(500);
  check((await body()).includes('报告部分完成'), '入库回执保留部分完成事实');
  check((await body()).includes('尚无读取证据'), '入库回执不自动变为教师可读');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await shot('prism-batch-mobile');
  check(await cdp.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Prism 窄屏详情不溢出');
  for(const face of ['sources','access','services']) {
    await goto('#/p/prism/w/'+face);
    await cdp.evaluate(`document.querySelector('[name="subject"]').value='测试对象';document.querySelector('[name="detail"]').value='隔离页面测试，不访问生产';document.querySelector('[data-prism-form]').requestSubmit()`);
    await sleep(400);
    check((await body()).includes('待接手'), 'Prism '+face+' 可保存独立准备任务');
  }
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await goto('#/p/bridge');
  check(await cdp.evaluate(`document.querySelectorAll('.sales-faces .face').length===4`), '对接表四个维护工作面');
  await shot('dock-console');
  await goto('#/p/bridge/w/tables');
  await cdp.evaluate(`document.querySelector('[name="subject"]').value='测试双表绑定';document.querySelector('[name="account"]').value='测试工作账号';document.querySelector('[name="detail"]').value='个人表已写，总表未知';document.querySelector('[data-dock-form]').requestSubmit()`);
  await sleep(500);
  check((await body()).includes('初始观察：结果未知'), '核对任务保留未知，不默认失败');
  await cdp.evaluate(`document.querySelector('[name="axis"]').value='personal';document.querySelector('[name="observedAt"]').value='2026-11-07T16:00:00+08:00';document.querySelector('[name="evidence"]').value='test-only-receipt';document.querySelector('[name="summary"]').value='个人表已核对';document.querySelector('[data-dock-form]').requestSubmit()`);
  await sleep(500);
  check((await body()).includes('个人表 · 报告已确认'), '个人表核对结果独立登记');
  check(!(await body()).includes('总表 · 报告已确认'), '不从个人表成功推断总表完成');
  await reload();
  check((await body()).includes('个人表已核对'), '对接表核对记录刷新保留');
  await shot('dock-task');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await shot('dock-task-mobile');
  check(await cdp.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), '对接表窄屏不溢出');
  for(const face of ['runtime','batches','deployment']) {
    await goto('#/p/bridge/w/'+face);
    await cdp.evaluate(`document.querySelector('[name="subject"]').value='test-object';document.querySelector('[name="account"]').value='test-account';document.querySelector('[name="detail"]').value='仅隔离页面测试';document.querySelector('[data-dock-form]').requestSubmit()`);
    await sleep(400);
    check(await exists('[data-dock="copy"]'), '对接表 '+face+' 可准备上下文');
  }
  console.log('\n[11] 浏览器控制台');
  check(consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join(' / ') : '没有报错');

  console.log('\n─────────────────────────────');
  console.log(`截图目录 ${SHOTS}`);
  console.log(`通过 ${pass} 项，失败 ${failures.length} 项`);
  if (failures.length) {
    failures.forEach((f) => console.log('  · ' + f));
  }

  chrome.kill();
  process.exit(failures.length ? 1 : 0);
};

function check(cond, label) {
  if (cond) ok(label);
  else fail(label);
}

main().catch((err) => {
  console.error('点验中断：', err.message);
  chrome.kill();
  process.exit(1);
});
