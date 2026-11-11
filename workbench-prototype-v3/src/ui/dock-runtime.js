const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const groups = [['bot', '飞书机器人'], ['primary', '主模型'], ['fallback', '备用模型']];
let root, config, busy = false;

export function initDockRuntime({notify} = {}) { /* Feedback stays beside the action rather than in transient toasts. */ }

export function dockRuntimeView() {
  return `<section id="dock-runtime"><style>
  #dock-runtime{max-width:1040px;letter-spacing:0}#dock-runtime header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
  #dock-runtime .runtime-group{border-top:1px solid var(--line,#35393b);padding:24px 0}#dock-runtime h3{font-size:18px;margin:0 0 20px}
  #dock-runtime .runtime-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 24px}
  #dock-runtime label{min-width:0;overflow-wrap:anywhere}#dock-runtime input{display:block;box-sizing:border-box;width:100%;min-height:44px;margin:8px 0;padding:10px 12px;border:1px solid #596065;border-radius:4px;background:#111315;color:#eee;font:inherit}
  #dock-runtime small{display:block;color:var(--muted,#b0b4b8);overflow-wrap:anywhere}#dock-runtime .runtime-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}
  #dock-runtime button{min-height:44px}#dock-runtime button:disabled{opacity:.55;cursor:default}#dock-runtime[aria-busy=true] button:disabled{cursor:wait}#dock-runtime :focus-visible{outline:2px solid #9ac8ed;outline-offset:3px}
  #dock-runtime [role=status]{min-height:24px;margin:8px 0;overflow-wrap:anywhere}#dock-runtime .runtime-checks{padding-left:20px;overflow-wrap:anywhere}
  #dock-runtime [role=status]:empty,#dock-runtime .runtime-checks:empty{display:none}#dock-runtime form{gap:12px;margin-bottom:8px}
  @media(max-width:640px){#dock-runtime .runtime-fields{grid-template-columns:1fr}}
  </style><header class="pagehead"><h2>运行配置</h2><button type="button" class="btn" data-runtime-action="read">重新读取</button></header>
  <p data-runtime-service class="sub">AFTB-Bot · 尚未读取</p><p data-runtime-feedback role="status" aria-live="polite"></p>
  <section class="runtime-group"><h3>主模型账户余额</h3><p data-runtime-balance role="status">尚未查询</p><button type="button" class="btn" data-runtime-action="balance">查询余额</button> <a data-runtime-console hidden target="_blank" rel="noopener noreferrer">账户控制台 ↗</a></section>
  <div data-runtime-groups></div><section class="runtime-group"><h3>AFTB-Bot 服务</h3><p data-runtime-pending class="sub"></p><button type="button" class="btn" data-runtime-action="restart" disabled>重启 AFTB-Bot</button></section></section>`;
}

async function readBalance(refresh=false) {
  const target=root, node=target?.querySelector('[data-runtime-balance]');
  if(!node)return;
  if(refresh)node.textContent='正在查询已保存的主模型账户';
  let failure='';
  try {
    if(refresh){const response=await fetch('/api/dock-runtime',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'balance'})});const result=await response.json();if(!response.ok||!result.ok)failure=result.message||'余额更新失败';}
    const response=await fetch('/api/balance-monitor',{cache:'no-store'});
    if(!response.ok)throw Error();
    const data=await response.json(),row=data.connections?.dock;
    if(root!==target||!target.isConnected)return;
    const amounts=row?.balances?.map(b=>`${b.currency} ${b.total}`).join(' · ');
    const stamp=row?.checkedAt?new Date(row.checkedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'';
    const unavailable=row?.errorCode?.startsWith('balance_');
    node.textContent=[amounts||'尚无可用余额',stamp&&`查询于 ${stamp} 北京时间`,failure||(unavailable?'服务商未提供可用余额，请到控制台查看':row?.error?'更新失败，以上为上次结果':''),`每 ${data.intervalMinutes} 分钟检查，低于 ${data.threshold} 元提醒`].filter(Boolean).join(' · ');
  } catch {if(root===target)node.textContent=failure||'余额读取失败，请重试';}
}

function feedback(message) { if (root?.isConnected) root.querySelector('[data-runtime-feedback]').textContent = message; }
function lock(value) {
  busy = value;
  root?.setAttribute('aria-busy', String(value));
  root?.querySelectorAll('button,input').forEach(node => { node.disabled = value || (!config && node.dataset.runtimeAction !== 'read'); });
}
function summary() {
  const state = config.service?.status;
  root.querySelector('[data-runtime-service]').textContent = `AFTB-Bot · ${{Running:'运行中',Stopped:'已停止',unknown:'状态未知'}[state] || state || '状态未知'}`;
  root.querySelector('[data-runtime-pending]').textContent = config.restartRequired ? '有已保存配置待重启生效' : '未报告待重启配置';
  const link=root.querySelector('[data-runtime-console]');
  const base=config.groups.find(g=>g.id==='primary')?.fields.find(f=>f.key==='AFTB_LLM_BASE_URL')?.value;
  if(link){const url=base?.startsWith('https://api.siliconflow.cn/')?'https://cloud.siliconflow.cn':base?.startsWith('https://api.deepseek.com')?'https://platform.deepseek.com':null;link.hidden=!url;if(url)link.href=url;}
}
async function describe() {
  const target = root;
  const response = await fetch('/api/dock-runtime', {cache:'no-store'});
  const data = await response.json();
  if (root !== target || !target?.isConnected) throw new Error('View changed');
  if (!response.ok || data.ok !== true || data.revision == null || !Array.isArray(data.groups)) throw new Error('读取运行配置失败');
  // Never retain secret values even if a faulty server includes one in describe.
  config = {...data, groups:data.groups.map(group => ({...group, fields:(group.fields || []).map(field => ({...field, value:field.secret ? '' : field.value}))}))};
  summary();
}
function renderFields() {
  root.querySelector('[data-runtime-groups]').innerHTML = groups.map(([id, label]) => {
    const group = config.groups.find(item => item.id === id);
    return `<section class="runtime-group"><h3>${label}</h3>${group ? `<form data-runtime-group="${id}" autocomplete="off"><div class="runtime-fields">${group.fields.map((field, index) => `<label for="runtime-${id}-${index}">${esc(field.label || field.key)}<input id="runtime-${id}-${index}" name="${esc(field.key)}" type="${field.secret ? 'password' : 'text'}" data-secret="${field.secret ? 'true' : 'false'}" value="${esc(field.secret ? '' : field.value)}" autocomplete="${field.secret ? 'new-password' : 'off'}" spellcheck="false" ${field.secret ? `placeholder="${field.configured ? '已配置 · 留空保持不变' : '未配置 · 留空保持不变'}"` : ''}><small>${esc(field.key)}${field.source ? ` · 来源：${esc(field.source)}` : ''}</small></label>`).join('')}</div><div class="runtime-actions"><button type="submit" class="btn" data-runtime-action="test">测试连接</button><button type="submit" class="btn" data-runtime-action="save">保存配置</button></div><p role="status" aria-live="polite" data-group-feedback></p><ul class="runtime-checks" data-group-checks></ul></form>` : '<p class="sub">后端未提供此组配置</p>'}</section>`;
  }).join('');
}
async function read() {
  if (busy) return;
  lock(true); feedback('正在读取运行配置');
  try { await describe(); renderFields(); feedback('配置已读取'); void readBalance(); }
  catch { config = null; feedback('读取失败，请重新读取后再操作'); }
  finally { lock(false); }
}
async function perform(action, form) {
  if (busy || !config) return;
  if (action === 'restart' && !globalThis.confirm('必须确认：仅重启 AFTB-Bot，期间机器人服务会短暂中断。是否继续？')) return;
  const target = root;
  const payload = {action, revision:config.revision};
  if (form) {
    payload.group = form.dataset.runtimeGroup;
    payload.values = Object.fromEntries(Array.from(form.querySelectorAll('input'), input => [input.name, input.value]));
  } else payload.confirm = true;
  let body = JSON.stringify(payload);
  // The serialized request is the only remaining secret-bearing copy after dispatch.
  if (payload.values) for (const key of Object.keys(payload.values)) payload.values[key] = '';
  if (action === 'save') form?.querySelectorAll('input[data-secret="true"]').forEach(input => { input.value = ''; });
  const status = form?.querySelector('[data-group-feedback]');
  const setMessage = message => { if (status) status.textContent = message; else feedback(message); };
  form?.querySelector('[data-group-checks]').replaceChildren();
  lock(true); setMessage(action === 'save' ? '正在保存配置' : action === 'test' ? '正在测试当前输入' : '正在重启 AFTB-Bot');
  try {
    const pending = fetch('/api/dock-runtime', {method:'POST', headers:{'content-type':'application/json'}, body});
    body = '';
    const response = await pending;
    const result = await response.json();
    if (root !== target || !target.isConnected) return;
    if (form && Array.isArray(result.checks)) form.querySelector('[data-group-checks]').innerHTML = result.checks.map(check => `<li>${esc(check.label)} · ${esc(check.status)}${check.message ? ` · ${esc(check.message)}` : ''}</li>`).join('');
    if (result.saved === true) {
      setMessage(result.message || '配置已保存；尚未重启 AFTB-Bot。');
    } else if (!response.ok || result.ok !== true) {
      setMessage(result.message || result.error || '操作失败，请重新读取配置后重试');
      if (response.status === 409) config = null;
      return;
    } else setMessage(action === 'save' ? '配置已保存；尚未重启 AFTB-Bot。' : action === 'test' ? `测试完成，未保存。${result.message || ''}` : `AFTB-Bot 重启请求成功。${result.message || ''}`);
    if (action !== 'test') {
      try { await describe(); }
      catch { config = null; setMessage(action === 'save' ? '配置已保存；尚未重启。状态刷新失败，必须重新读取后再操作。' : '重启请求成功；状态刷新失败，必须重新读取确认服务状态。'); }
    }
  } catch {
    config = null;
    setMessage(action === 'test' ? '测试请求失败，请重新读取后重试。' : '请求结果未知，必须重新读取确认状态，不要直接重复提交。');
  } finally { body = ''; if (root === target) lock(false); }
}

export function dockRuntimeMounted() {
  const next = document.querySelector('#dock-runtime');
  if (!next) { root = null; config = null; return; }
  if (root === next) return;
  root = next; config = null; busy = false;
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-runtime-action]');
    if (!button || busy) return;
    if (button.dataset.runtimeAction === 'read') {
      if (config && !globalThis.confirm('重新读取会清除未保存的输入，是否继续？')) return;
      void read();
    }
    if (button.dataset.runtimeAction === 'restart') void perform('restart');
    if (button.dataset.runtimeAction === 'balance') {lock(true);void readBalance(true).finally(()=>{if(root===next)lock(false);});}
  });
  root.addEventListener('submit', event => {
    const form = event.target.closest('[data-runtime-group]');
    if (!form) return;
    event.preventDefault();
    const action = event.submitter?.dataset.runtimeAction;
    if (action === 'save' || action === 'test') void perform(action, form);
  });
  void read();
}
