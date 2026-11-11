export function prismCollectionView() {
  return `<section class="prism-collection" aria-label="资料采集">
    <section class="prism-collection-source">
      <p class="prism-source-label">微信教研群</p>
      <h2>教研图片</h2>
      <p class="sub">收集群内图片与笔记附图，按老师和日期归档。</p>
      <details class="prism-collection-prepare">
        <summary>准备下载图片</summary>
        <div class="prism-collection-fields">
          <label>采集范围<select name="image-range"><option value="recent">最近两天</option><option value="custom">指定起始日期</option></select></label>
          <label data-prism-date hidden>从哪天开始<input type="date" name="image-since"></label>
          <p class="sub">仅采集已配置的四个教研群；已归档图片按现有规则去重。</p>
          <button class="btn" data-collect="images">下载新增图片</button>
        </div>
      </details>
      <div data-collection-status="images" role="status" aria-live="polite"></div>
      <details class="prism-source-settings"><summary>来源与保存位置</summary>
        <p>校长群、素描教研群、色彩教研群、速写教研群。沿用当前采集账号与白名单。</p>
        <p>现有定时安排：每日 21:00（北京时间），回看两天。</p>
        <p class="prism-local-path">smart-customer-service / corpus_raw / crm / ifangzhou / jyq</p>
        <p class="sub">定时任务的当次运行结果见总览中的教研图片采集。</p>
      </details>
    </section>
    <section class="prism-collection-source">
      <p class="prism-source-label">飞书知识库</p>
      <h2>教学笔记</h2>
      <p class="sub">下载科目目录内的笔记和图片，保留来源并整理结构。</p>
      <details class="prism-collection-prepare">
        <summary>准备下载笔记</summary>
        <div class="prism-collection-fields">
          <fieldset><legend>科目目录</legend><div class="prism-subjects">
            <label><input type="checkbox" name="prism-subject" value="color" checked>色彩</label>
            <label><input type="checkbox" name="prism-subject" value="sketch" checked>素描</label>
            <label><input type="checkbox" name="prism-subject" value="quick" checked>速写</label>
          </div></fieldset>
          <p class="sub">正文与图片一并下载，按科目、班级和作者整理；保留原始资料，不覆盖历史批次。</p>
          <button class="btn" data-collect="notes">下载并整理笔记</button>
        </div>
      </details>
      <div data-collection-status="notes" role="status" aria-live="polite"></div>
      <details class="prism-source-settings"><summary>来源与保存位置</summary>
        <p>沿用已有的色彩、素描、速写三个科目目录，不扫描整个飞书空间。</p>
        <p class="prism-local-path">D:/教研资产/Prism/exports/</p>
        <p class="sub">当前脚本下载文档与图片；普通附件仅保留目录信息。整理不等于发布到 Prism。</p>
      </details>
    </section>
  </section><section data-note-archives aria-label="已归档笔记"><h2>已归档笔记</h2><p>正在读取本地归档…</p></section>`;
}

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'未记录';
const labels={running:'正在采集',complete:'已完成',partial:'部分完成',failed:'失败',unknown:'结果待核对',complete_with_errors:'部分完成',unreadable:'清单读取失败'};
let timer, mounted, selectedArchive='', archives=[], submitting=false, archivesSignature='', imageReceipt='';
function paintArchives(){
  const region=document.querySelector('[data-note-archives]');
  if(!region)return;
  if(!archives.some(a=>a.id===selectedArchive))selectedArchive=archives[0]?.id||'';
  const item=archives.find(a=>a.id===selectedArchive);
  region.innerHTML=`<h2>已归档笔记</h2>${item?`<label>飞书归档批次<select data-note-batch>${archives.map(a=>`<option value="${esc(a.id)}" ${a.id===selectedArchive?'selected':''}>${esc(time(a.createdAt))} · ${a.notes??a.stats.documentsExported??0} ${a.notes===null?'篇文档':'篇笔记'}</option>`).join('')}</select></label><p>${esc(labels[item.status]||'下载中')} · ${item.stats.documentsExported??0} 篇文档 · ${item.notes??'尚未整理'} ${item.notes===null?'':'篇笔记'} · ${item.stats.mediaReferences??0} 个图片引用</p><p class="sub">${item.normalized?'已结构化整理':'尚未完成结构化整理'} · 普通附件 ${item.stats.metadataOnly??0} 项仅保存目录信息</p><p class="prism-local-path">${esc(item.path)}</p>${item.errors.length?`<details><summary>${item.errors.length} 项下载问题</summary><ul>${item.errors.map(e=>`<li>${esc(e.stage)} · ${esc(e.error)} · ${esc(e.nodeToken)}</li>`).join('')}</ul></details>`:''}`:'<p>暂无已归档笔记</p>'}`;
}
async function refresh(){
  clearTimeout(timer);
  if(!document.querySelector('.prism-collection'))return;
  try{
    const response=await fetch('/api/prism-collection');
    if(!response.ok)throw Error('采集状态读取失败');
    const data=await response.json();archives=data.archives;
    const imageJob=data.jobs.find(j=>j.kind==='images');
    if(imageJob?.completedAt&&imageReceipt!==imageJob.id){imageReceipt=imageJob.id;document.dispatchEvent(new Event('prism-images-collected'));}
    const signature=JSON.stringify(archives);
    if(signature!==archivesSignature||!document.querySelector('[data-note-batch]')){archivesSignature=signature;paintArchives();}
    for(const kind of ['images','notes']){
      const job=data.jobs.find(j=>j.kind===kind), region=document.querySelector(`[data-collection-status="${kind}"]`);
      if(region)region.innerHTML=job?`<p>${esc(labels[job.status]||job.status)} · ${esc(job.status==='running'?job.stage:job.message)}</p>${job.counts?`<p class="sub">${kind==='images'?`新增图片 ${(job.counts.images||0)+(job.counts.note_images||0)} · 已有跳过 ${job.counts.duplicate||0} · 媒体失败 ${(job.counts.images_skipped||0)+(job.counts.xml_fetch_failed||0)}`:`文档 ${job.counts.documentsExported||0} · 图片引用 ${job.counts.mediaReferences||0} · 错误 ${job.counts.errors||0}`}</p>`:''}<p class="sub">开始 ${esc(time(job.createdAt))}${job.completedAt?` · 结束 ${esc(time(job.completedAt))}`:''} · 北京时间</p>`:'';
    }
    document.querySelectorAll('[data-collect]').forEach(b=>{b.disabled=submitting||data.jobs.some(j=>j.status==='running');});
  }catch(error){for(const region of document.querySelectorAll('[data-collection-status]'))region.textContent=error.message;}
  timer=setTimeout(refresh,3000);
}
export function prismCollectionMounted(){
  const region=document.querySelector('.prism-collection');
  if(region&&region!==mounted){mounted=region;refresh();}
}
export function initPrismCollection() {
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-collect]');
    if(!button||submitting)return;
    const kind=button.dataset.collect,body={kind},region=document.querySelector(`[data-collection-status="${kind}"]`);
    if(kind==='images'&&document.querySelector('[name="image-range"]').value==='custom'){
      body.since=document.querySelector('[name="image-since"]').value;
      if(!body.since){region.textContent='请选择起始日期';return;}
    }
    if(kind==='notes'){
      body.subjects=[...document.querySelectorAll('[name="prism-subject"]:checked')].map(x=>x.value);
      if(!body.subjects.length){region.textContent='请至少选择一个科目';return;}
    }
    submitting=true;button.disabled=true;region.textContent='正在提交下载任务…';
    try{
      const response=await fetch('/api/prism-collection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json();if(!response.ok)throw Error(data.error||'任务提交失败');
      if(data.job?.output)selectedArchive=data.job.output.split(/[\\/]/).pop();
      submitting=false;await refresh();
    }catch(error){region.textContent=error.message;submitting=false;button.disabled=false;}
  });
  document.addEventListener('change', event => {
    if(event.target.matches('[data-note-batch]')){selectedArchive=event.target.value;paintArchives();}
    if (event.target.matches('.prism-collection [name="image-range"]')) {
      event.target.closest('.prism-collection-fields').querySelector('[data-prism-date]').hidden = event.target.value !== 'custom';
    }
  });
}
