const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
import {knowledgeNavigation} from './knowledge-navigation.js';
const typeLabels = { TEXT: '文本', LINK: '链接', IMAGE: '图片' };
export function materialsWorkface() {
  return { body: `<link rel="stylesheet" href="/src/ui/team-materials.css"><section id="team-materials">
    ${knowledgeNavigation('物料')}
    <header class="library-heading"><h2>团队物料</h2><div class="library-actions"><button data-add>添加物料</button><button data-refresh>刷新</button></div></header>
    <div class="tm-tools"><input type="search" aria-label="搜索物料" placeholder="搜索物料"><select aria-label="物料类型"><option value="">全部类型</option><option value="TEXT">文本</option><option value="LINK">链接</option><option value="IMAGE">图片</option></select></div>
    <p data-status role="status"></p><div data-list></div>
    <dialog data-edit><form><h2>添加物料</h2><label>标题<input name="title" maxlength="120" required></label><label>类型<select name="kind"><option value="text">文本 / 链接</option><option value="image">图片</option></select></label><label data-text>文本 / 链接<textarea name="content" maxlength="16000"></textarea></label><label data-image hidden>图片（工作台上限 8 MB）<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label><img data-preview hidden alt="待上传图片预览"><p data-feedback role="status"></p><button type="submit">上传</button><button type="button" data-close>关闭</button></form></dialog><dialog data-detail><div data-detail-body></div><button data-close>关闭</button></dialog></section>` };
}
export function materialsMounted() {
  const root = document.getElementById('team-materials');
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = 'true';
  const $ = s => root.querySelector(s);
  let items = [], imageData, requestId, locked = false, deleting=false;
  const uncertain=new Set();
  let capability={can_delete:false,message:'正在核对管理连接'};
  let capabilityReady;
  function loadCapabilities(){
    return capabilityReady=fetch('/api/team-materials/capabilities').then(r=>r.ok?r.json():Promise.reject()).then(data=>{capability=data;render();}).catch(()=>{capability={can_delete:false,message:'管理连接读取失败'};render();});
  }
  function uploader(m){
    const source=capability.uploaders?.[m.id];
    return source?.person_name?`上传者：${source.person_name}`:source?.name?`上传来源：${source.name}（设备）`:'上传者：未记录';
  }
  const edit = $('[data-edit]'), form = $('form');
  const status = $('[data-status]'), feedback = $('[data-feedback]');
  function render() {
    const q = $('input[type=search]').value.toLowerCase(), type = $('select[aria-label]').value;
$('[data-list]').innerHTML = items.filter(m => (!type || m.type === type) && `${m.title} ${m.content}`.toLowerCase().includes(q)).map(m => `<button class="tm-row" data-id="${esc(m.id)}"><strong>${esc(m.title)}</strong><span>${esc(typeLabels[m.type] || m.type)}</span><span>${esc((m.content || '').slice(0, 160))}</span><span class="tm-uploader">${esc(uploader(m))}</span></button>`).join('') || '<p>暂无物料</p>';
  }
  async function refresh() {
    void loadCapabilities();
    status.textContent = '读取中';
    try { const r = await fetch('/api/team-materials'); if (!r.ok) throw Error(); const data = await r.json(); if (!Array.isArray(data.materials)) throw Error(); items = data.materials; render(); status.textContent = `${items.length} 项物料`; }
    catch { status.textContent = '读取失败，保留原列表'; }
  }
  $('[data-refresh]').onclick = refresh;
  $('input[type=search]').oninput = render;
  $('select[aria-label]').onchange = render;
  $('[data-add]').onclick = () => edit.showModal();
  root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
  form.elements.kind.onchange = () => { $('[data-text]').hidden = form.elements.kind.value === 'image'; $('[data-image]').hidden = form.elements.kind.value !== 'image'; };
  form.elements.image.onchange = async () => {
    imageData = undefined; $('[data-preview]').hidden = true;
    const file = form.elements.image.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(file.type)) { feedback.textContent = '仅支持 PNG、JPEG、WebP，工作台上限 8 MB'; return; }
    const reader = new FileReader();
    reader.onload = () => { imageData = String(reader.result).split(',')[1]; $('[data-preview]').src = reader.result; $('[data-preview]').hidden = false; feedback.textContent = ''; };
    reader.onerror = () => { feedback.textContent = '图片读取失败'; };
    reader.readAsDataURL(file);
  };
  form.onsubmit = async event => {
    event.preventDefault(); if (locked) return;
    const payload = { requestId: requestId ??= crypto.randomUUID(), title: form.elements.title.value };
    if (form.elements.kind.value === 'image') { if (!imageData) { feedback.textContent = '请选择有效图片'; return; } payload.base64 = imageData; }
    else { payload.content = form.elements.content.value; if (!payload.content.trim()) { feedback.textContent = '请输入文本或链接'; return; } }
    locked = true; const submit = $('button[type=submit]'); submit.disabled = true;
    feedback.textContent = '上传中';
    try {
      const r = await fetch('/api/team-materials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await r.json();
      if (result.status === 'knownfailure') {
        feedback.textContent = '上传已被拒绝，输入已保留。修改后可重新提交。';
        requestId = undefined; locked = false; submit.disabled = false; return;
      }
      if (result.status !== 'knownsuccess') throw Error();
      feedback.textContent = '上传成功'; form.reset(); imageData = undefined; requestId = undefined; $('[data-preview]').hidden = true; form.elements.kind.onchange(); locked = false; submit.disabled = false; edit.close(); await refresh();
    } catch { feedback.textContent = '上传结果未知，已禁止重复提交。输入已保留。'; }
  };
  $('[data-list]').onclick = async event => {
    const button = event.target.closest('[data-id]'); if (!button) return;
    await capabilityReady;
    if (!root.isConnected) return;
    const m = items.find(m => m.id === button.dataset.id); if (!m) return;
    $('[data-detail-body]').innerHTML = `<h2>${esc(m.title)}</h2><p class="tm-uploader">${esc(uploader(m))}</p>${m.type === 'IMAGE' ? `<img alt="${esc(m.title)}" src="/api/team-materials/images/${encodeURIComponent(m.id)}">` : `<p class="tm-content">${esc(m.content)}</p>`}<p data-delete-status role="status">${esc(uncertain.has(m.id)?'删除结果未知，请刷新列表核对':capability.can_delete?'':capability.message)}</p><button data-delete ${!capability.can_delete||uncertain.has(m.id)||deleting?'disabled':''}>删除物料</button>`;
    $('[data-delete]').onclick=async()=>{
      if(deleting||!confirm(`删除“${m.title}”？删除后团队将无法从服务获取该物料。`))return;
      deleting=true;const button=$('[data-delete]'),message=$('[data-delete-status]');button.disabled=true;message.textContent='删除中';
      try{
        const r=await fetch('/api/team-materials/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:m.id,title:m.title})});
        const result=await r.json();
        if(result.status==='knownfailure'){
          message.textContent=result.message||(result.httpStatus===409?'物料已变化，请刷新后重试':'删除被拒绝，请核对管理服务连接');button.disabled=false;return;
        }
        if(!r.ok||result.status!=='knownsuccess')throw Error();
        items=items.filter(item=>item.id!==m.id);render();message.textContent='已删除';
        await refresh();
      }catch{uncertain.add(m.id);message.textContent='删除结果未知，请刷新列表核对，勿重复提交';}
      finally{deleting=false;}
    };
    $('[data-detail]').showModal();
  };
  refresh();
}
