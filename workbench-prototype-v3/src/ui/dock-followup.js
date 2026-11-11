const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const errors={no_pending_rows:'该批次当前没有可追问的必填缺项。',cards_disabled:'机器人尚未启用待补卡片。',stale_preview:'待补项已变化，请重新预览。',session_changed:'员工会话已更新，请重新预览，避免覆盖正在进行的操作。',runtime_changed:'运行配置已变化，请重新预览。',batch_not_found:'未找到该批次。',unauthorized:'无法核对该批次的所属账号与会话。',send_outcome_unknown:'发送结果未知，请核对原会话；不会自动重复发送。',invalid_token:'预览已失效，请重新预览。',operation_failed:'操作未完成，请核对服务和发送记录。'};
errors.remote_quota_exhausted='飞书本月 API 调用额度已用尽，无法核对当前待补项，本次未发送卡片。请管理员检查飞书调用额度与套餐，额度恢复后再预览。';
errors.remote_rate_limited='飞书表格读取触发短时限流，暂时无法确认最新待补项；本次未发送卡片，也未自动重试。请稍后手动重新预览。';
errors.remote_batch_unavailable='无法读取飞书表格的最新记录，本次未发送卡片。请核对表格权限和接口状态。';
errors.pre_send_failed='尚未发送卡片，会话准备未完成，请重新预览。';
let initialized=false;
const previews=new WeakMap();
export function dockFollowupView(batchCode){return `<section class="dock-followup" data-dock-followup="${esc(batchCode)}"><div class="dock-followup-heading"><div><h4>必填待补项</h4><p class="sub">按当前记录核对缺项，发回批次原会话。</p></div><button class="btn btn--primary" data-followup-action="preview">追问待补项</button></div><div data-followup-preview></div><p role="status" aria-live="polite" data-followup-status></p></section>`;}
export function initDockFollowup(){
  if(initialized)return;initialized=true;
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-followup-action]');
    const host=button?.closest('[data-dock-followup]');
    if(!host||host.dataset.busy==='true')return;
    const action=button.dataset.followupAction,preview=previews.get(host);
    if(action==='send'&&(!preview||!globalThis.confirm('确认向该批次所属的原会话发送待补卡片？')) )return;
    host.dataset.busy='true';host.querySelectorAll('button').forEach(b=>b.disabled=true);
    const status=host.querySelector('[data-followup-status]');
    status.textContent=action==='preview'?'正在读取当前必填缺项':'正在发送待补卡片';
    try{
      const response=await fetch('/api/dock-followup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(action==='preview'?{action,batchCode:host.dataset.dockFollowup}:{action,token:preview.token,confirm:true})});
      const result=await response.json();
      if(!host.isConnected)return;
      if(!response.ok||!result.ok){
        previews.delete(host);host.querySelector('[data-followup-preview]').replaceChildren();
        if(result.status==='unknown'||(action==='send'&&!response.ok))host.dataset.blocked='true';
        status.textContent=errors[result.error]||'未能完成，请重新核对批次。';return;
      }
      if(action==='preview'&&!result.previewBlocked){
        previews.set(host,result);
        host.querySelector('[data-followup-preview]').innerHTML=`<p>${esc(result.senderLabel||result.recipientLabel||'批次所属账号')} · ${esc(result.chatLabel||'该批次的原会话')}</p><p>批次 ${esc(result.batchCode)} · ${esc(result.pendingCount)} 条待补记录</p><ul>${(result.rows||[]).map(r=>`<li>${esc(r.sheet)} · 第 ${esc(r.rowNumber)} 行：${esc((r.missing||[]).join('、'))}</li>`).join('')}</ul><p class="sub">员工点击卡片选择记录，再在原会话回复补充内容。</p><button class="btn" data-followup-action="send">确认发送卡片</button>`;
        status.textContent='尚未发送';
      }else{
        previews.delete(host);host.querySelector('[data-followup-preview]').replaceChildren();host.dataset.blocked='true';
        status.textContent=(result.replayed?'已返回之前的发送回执，未重复发送。':'飞书已接受待补卡片。')+(result.callbackBound===false?'接续绑定未确认，请核对原会话，不要重新发送。':'员工填写结果请在批次中重新读取。');
      }
    }catch{if(host.isConnected){previews.delete(host);host.querySelector('[data-followup-preview]').replaceChildren();if(action==='send')host.dataset.blocked='true';status.textContent=action==='send'?'发送结果未知，请核对原会话，不要重复发送。':'预览失败，请重试。';}}
    finally{host.dataset.busy='false';host.querySelectorAll('button').forEach(b=>b.disabled=host.dataset.blocked==='true');}
  });
}
