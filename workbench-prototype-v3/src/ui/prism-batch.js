let services, initialized = false, loaded = false, busy = false, error = '';
let batches = [], selected = '', observedAt = '';
let mountedRegion = null;
const results = new Map();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const redraw = () => {
  const region = document.querySelector('[data-prism-batch]');
  if (!region) return;
  const focus = region.contains(document.activeElement) ? document.activeElement : null;
  const action = focus?.dataset.prismBatchAction;
  const selectFocused = focus?.matches('[data-prism-batch-select]');
  const expanded = [...region.querySelectorAll('details')].map(detail => detail.open);
  region.outerHTML = prismBatchView({advanced:region.dataset.advanced === 'true'});
  mountedRegion = document.querySelector('[data-prism-batch]');
  mountedRegion.querySelectorAll('details').forEach((detail, index) => { detail.open = expanded[index] || false; });
  if (selectFocused) document.querySelector('[data-prism-batch-select]')?.focus();
  else if (action) document.querySelector(`[data-prism-batch-action="${action}"]`)?.focus();
};

export function prismBatchView({advanced = false} = {}) {
  const batch = batches.find(row => row.batchId === selected);
  const result = results.get(selected) || {};
  const verified = result.verify?.data;
  const isolated = result.isolated?.data;
  const full = result.full?.data;
  const passed = isolated && ['accepted','duplicate','authorizedRead','unauthorizedDenied','mediaMatched'].every(key => isolated[key] === true);
  return `<section data-prism-batch data-advanced="${advanced}" aria-busy="${busy}"><header class="pagehead"><h2>已归档图片</h2><button class="btn" data-prism-batch-action="archive-inspect" ${busy ? 'disabled' : ''}>刷新批次</button></header>
    ${error ? `<p role="alert" class="prism-warning">${esc(error)}</p>` : ''}
    ${!loaded ? '<p role="status">正在读取归档批次…</p>' : !error && !batches.length ? '<p>归档暂无批次。</p>' : ''}
    <label>微信归档批次<select data-prism-batch-select ${busy || !batches.length ? 'disabled' : ''}>${batches.map(row => `<option value="${esc(row.batchId)}" ${row.batchId === selected ? 'selected' : ''}>${esc(row.lastFetchedAt)} · ${row.images} 张图片</option>`).join('')}</select></label>
    <div class="prism-stage"><h3>本批资料</h3><p>${batch ? `${batch.records} 条归档记录 · ${batch.images} 张图片` : '尚无选定批次'}</p>${batch ? `<p class="sub">归档时间：${esc(batch.lastFetchedAt)}</p>` : ''}</div>
    ${advanced ? `<details class="prism-archive-advanced"><summary>图片完整性与隔离入库验证</summary>
    <div class="prism-stage"><h3>媒体解码</h3><p>${verified ? `${verified.valid} / ${verified.checked} 张可解码${verified.checked === 0 ? ' · 没有图片可检查' : verified.valid < verified.checked ? ' · 存在缺失或损坏' : ''}` : '尚未检查'}</p><button class="btn" data-prism-batch-action="archive-verify" ${busy || !batch?.images ? 'disabled' : ''}>检查媒体完整性</button>${result.verify ? `<p class="sub">检查起点（主机 UTC）：${esc(result.verify.observedAt)}</p>` : ''}</div>
    <div class="prism-stage"><h3>整批入库与读取</h3><p>${full ? `已处理 ${full.completed} / ${full.total} · 通过 ${full.passed} · 失败 ${full.failed}` : '尚未验证'}</p><p class="sub">本地隔离，不写生产。必须为 1–100 张、累计不超过 100 MB 的批次。</p><button class="btn btn--primary" data-prism-batch-action="batch-isolated-verify" ${busy || !batch?.images || batch.images > 100 ? 'disabled' : ''}>验证整批（本地隔离）</button>${full?.failed ? `<ul>${full.items.filter(item => !item.ok).map(item => `<li>第 ${item.index + 1} 项：${esc(item.error)}</li>`).join('')}</ul>` : ''}${full?.temporaryDatabaseDeleted ? '<p class="sub">临时数据库已删除。</p>' : ''}<details><summary>高级检查</summary><p class="sub">执行预算 90 秒，超限未处理项记为失败；Node 等待上限 120 秒。逐项临时入库、重复输入、授权读取与媒体比对、匿名拒绝；不代表生产可用或教师实测。</p><h4>首张样本</h4><p>${isolated ? passed ? '单张真实样本通过入库、幂等、授权读取与未授权拒绝' : '隔离验证未全部通过' : '尚未验证'}</p><p class="sub">仅取本批次首张图片写入本机临时库，不代表整批验证。</p><button class="btn" data-prism-batch-action="isolated-verify" ${busy || !batch?.images ? 'disabled' : ''}>验证首张图片（本机临时库）</button>${result.isolated ? `<p class="sub">验证起点（主机 UTC）：${esc(result.isolated.observedAt)}</p>` : ''}</details></div>
    <div class="prism-stage"><h3>生产目标</h3><p>未核验 · 未启用生产写入</p></div>
    </details>` : ''}
    ${observedAt ? `<p class="sub">更新于 ${esc(new Date(observedAt).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}))} · 北京时间</p>` : ''}
  </section>`;
}

async function run(action) {
  if (busy) return;
  const batchId = selected;
  busy = true; error = ''; redraw();
  try {
    const response = await fetch(action === 'archive-inspect' ? '/api/prism-batch?action=archive-inspect' : '/api/prism-batch', action === 'archive-inspect' ? {} : {
      method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({action, batchId}),
    });
    const reply = await response.json();
    if (!response.ok || !reply.ok || reply.action !== action || reply.schemaVersion !== '1.0') throw Error('批次检查失败；未执行生产写入。请重试或检查本机服务。');
    if (action === 'archive-inspect') {
      if (!Array.isArray(reply.data?.batches)) throw Error('批次响应格式异常');
      batches = reply.data.batches;
      selected = batches.some(row => row.batchId === selected) ? selected : reply.data.latestBatchId || '';
      observedAt = reply.observedAt;
      loaded = true;
    } else {
      if (action !== 'isolated-verify' && reply.data?.batchId !== batchId) throw Error('批次响应不匹配');
      const previous = results.get(batchId) || {};
      results.set(batchId, {...previous, [action === 'archive-verify' ? 'verify' : action === 'batch-isolated-verify' ? 'full' : 'isolated']: reply});
    }
  } catch (err) { error = err.message || '本机服务不可用'; loaded = true; }
  finally { busy = false; redraw(); }
}

export function initPrismBatch(options) {
  services = options;
  if (initialized) return;
  initialized = true;
  document.addEventListener('prism-images-collected',()=>{if(document.querySelector('[data-prism-batch]'))void run('archive-inspect');});
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-prism-batch-action]');
    if (button && !button.disabled) void run(button.dataset.prismBatchAction);
  });
  document.addEventListener('change', event => {
    if (event.target.matches('[data-prism-batch-select]') && !busy) {
      selected = event.target.value; error = ''; redraw();
    }
  });
}

export function prismBatchMounted() {
  const region = document.querySelector('[data-prism-batch]');
  if (!region) { mountedRegion = null; return; }
  if (services && region !== mountedRegion && !busy) {
    mountedRegion = region;
    void run('archive-inspect');
  }
}
