const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,options){const r=await fetch(path,options);const data=await r.json();if(!r.ok)throw Error(data.error||data.message||'操作失败');return data;}
let active;
const stateName=s=>({running:'正在更新',preparing:'正在准备',publishing:'正在上传并登记安装包',dispatching:'正在下发',completed:'本批下发结束',partial:'部分下发',interrupted:'已中断，待核对',failed:'未完成',submit_outcome_unknown:'结果未知，已停止后续下发',accepted_not_verified:'已下发 · 版本待确认',rejected:'未下发',skipped:'已跳过',pending:'待下发',stopped:'已停止'}[s]||'待核对');
const reasonName=s=>({work_client_upgrade_required:'请先升级手机端方舟工作端',device_unavailable:'设备当前不可用',device_offline:'设备离线',offline:'设备离线',app_changed:'应用登记已变更',read_failed:'提交前核对失败',device_read_failed:'读取工作机失败，未下发',selected_device_missing:'所选工作机已变化，未下发',no_eligible_devices:'没有可更新的工作机',publish_failed:'安装包发布未完成，请核对发布记录后再处理',restart_interrupted:'服务重启中断了任务，请核对已提交记录',batch_persistence_failed:'记录保存失败，已停止后续下发',receipt_persistence_failed:'回执保存失败，已停止后续下发',batch_failed:'任务未完成，请核对记录',submit_outcome_unknown:'请核对平台和手机，勿重复提交'}[s]||'');

export async function openDeviceBatch(){
  active?.close();
  const dialog=document.createElement('dialog');active=dialog;dialog.className='device-dialog device-batch-dialog';
  dialog.innerHTML=`<header><h2>批量更新销售助手</h2><button type="button" data-close aria-label="关闭">×</button></header>
    <label class="device-apk-drop" data-drop><strong>拖入新的 APK 安装包</strong><span>或选择文件</span><input type="file" accept=".apk" aria-label="选择 APK 安装包"></label>
    <p data-file role="status"></p><div data-targets>正在读取工作机…</div>
    <p data-feedback role="status"></p><footer><button data-start disabled>确认批量更新</button></footer>
    <section data-progress aria-live="polite"></section>`;
  document.body.append(dialog);dialog.showModal();
  let alive=true,release=null,devices=[],busy=false,timer,requestId=crypto.randomUUID();
  const drop=dialog.querySelector('[data-drop]'),input=dialog.querySelector('input'),start=dialog.querySelector('[data-start]'),feedback=dialog.querySelector('[data-feedback]'),fileStatus=dialog.querySelector('[data-file]'),targets=dialog.querySelector('[data-targets]'),progress=dialog.querySelector('[data-progress]');
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{alive=false;clearTimeout(timer);dialog.remove();if(active===dialog)active=null;},{once:true});
  const selected=()=>[...targets.querySelectorAll('input:checked')].map(i=>i.value);
  const update=()=>{const count=selected().length;start.disabled=busy||!release||!count;start.textContent=count?`确认更新 ${count} 台`:'确认批量更新';};
  targets.onchange=update;
  function renderBatch(batch){
    const results=batch.results||[];
    progress.innerHTML=`<h3>${stateName(batch.state)}</h3><p class="sub">${esc(batch.id||batch.requestId)}</p>${batch.message?`<p>${reasonName(batch.message)||'请核对本次任务记录'}</p>`:''}${results.map(r=>`<p><strong>${esc(devices.find(d=>d.id===r.deviceId)?.label||r.deviceId?.slice(-6))}</strong> · ${stateName(r.state)}${reasonName(r.message||r.reason)?`<small>${reasonName(r.message||r.reason)}</small>`:''}</p>`).join('')}`;
  }
  async function observe(id){
    try {const batch=await api('/api/work-devices/batches/'+encodeURIComponent(id));if(!alive)return;renderBatch(batch);
      if(['running','preparing','publishing','dispatching','pending'].includes(batch.state))timer=setTimeout(()=>observe(id),1200);
      else {feedback.textContent='下发记录已保存，可返回清单刷新安装回报。';}
    }catch(e){if(alive)feedback.textContent=e.message+'；下发可能仍在进行，请关闭后重新打开核对。';}
  }
  async function inspect(file){
    if(busy||!file)return;
    if(!/\.apk$/i.test(file.name)){feedback.textContent='请选择 APK 安装包。';return;}
    if(file.size>128*1024*1024){feedback.textContent='安装包不能超过 128 MB。';return;}
    busy=true;release=null;update();input.disabled=true;feedback.textContent='';fileStatus.textContent='正在检查安装包、版本和签名…';
    try{const data=await api('/api/work-devices/releases',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});if(!alive)return;release=data;requestId=crypto.randomUUID();fileStatus.textContent=`${file.name} · v${data.versionCode} · ${data.versionName||''} · ${(data.bytes/1024/1024).toFixed(1)} MB`;feedback.textContent='安装包检查通过。确认后上传至方舟并向所选工作机下发，保留手机原有资料。';}
    catch(e){fileStatus.textContent='安装包未通过检查';feedback.textContent=e.message;}
    finally{busy=false;input.disabled=false;update();}
  }
  input.onchange=()=>inspect(input.files[0]);
  for(const name of ['dragenter','dragover'])drop.addEventListener(name,e=>{e.preventDefault();e.stopPropagation();if(!busy)drop.classList.add('is-dragging');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('is-dragging'));
  drop.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();drop.classList.remove('is-dragging');if(e.dataTransfer.files.length!==1){feedback.textContent='每次拖入一个 APK。';return;}void inspect(e.dataTransfer.files[0]);});
  start.onclick=async()=>{
    if(busy||!release||!selected().length)return;
    busy=true;update();input.disabled=true;targets.querySelectorAll('input').forEach(i=>i.disabled=true);feedback.textContent='正在建立批量更新任务…';
    try{const batch=await api('/api/work-devices/batches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,releaseId:release.releaseId,deviceIds:selected()})});if(alive){renderBatch(batch);void observe(batch.id||batch.requestId);}}
    catch(e){if(alive)feedback.textContent=e.message+'；请重新打开核对任务记录，不要重复提交。';}
  };
  try{
    const data=await api('/api/work-devices');if(!alive)return;devices=data.devices;
    targets.innerHTML=`<h3>目标工作机</h3><div class="device-batch-targets">${devices.map(d=>{const blocked=d.upgradeBlock==='work_client_upgrade_required';const available=d.online===true&&!blocked;return `<label><input type="checkbox" value="${esc(d.id)}" ${available?'checked':'disabled'}><span>${esc(d.label)}<small>${blocked?'请先升级手机端方舟工作端':d.online!==true?'离线或状态未知，本次跳过':esc(d.workClientVersion||'工作端版本未知')}</small></span></label>`;}).join('')}</div>`;
    update();
    const history=await api('/api/work-devices/batches');if(!alive)return;
    const last=history.at(-1);if(last){renderBatch(last);if(['running','preparing','publishing','dispatching','pending'].includes(last.state)){busy=true;update();input.disabled=true;targets.querySelectorAll('input').forEach(i=>i.disabled=true);void observe(last.id||last.requestId);}}
  }catch(e){if(alive){feedback.textContent=e.message;targets.textContent='未取得完整工作机清单。';}}
}
