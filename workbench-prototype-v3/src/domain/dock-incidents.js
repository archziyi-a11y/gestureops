const routes = {runtime:'#/p/bridge/w/runtime', followup:'#/p/bridge/w/batches'};
const expected = new Set(['no_pending_rows','batch_not_found','session_changed','stale_preview','runtime_changed','invalid_request','confirmation_required','invalid_token','stale_revision','explicit_confirmation_required']);

// Only controlled classifications enter shared context, never raw provider errors or credentials.
export function dockIncident(action, result) {
  const base = {project:'bridge',status:'open',severity:'normal',handling:'routine',escalate:false,
    source:'workbench-prototype-v3/docs/maintenance/DOCK.md', href:routes[action==='preview'||action==='send'?'followup':'runtime'], actionLabel:'打开对应工作面'};
  const code = result?.error;
  if (result?.status==='unknown' || result?.status==='submit_outcome_unknown') return {...base,kind:'outcome',severity:'unknown',handling:'agent',status:'unknown',title:'对接表操作结果待核对',impact:'操作可能已经生效，重复提交可能造成重复消息或写入。',next:'核对原操作回执和目标对象，确认之前不要重试。'};
  if (result?.status==='accepted' && result.callbackBound===false) return {...base,kind:'callback',severity:'unknown',handling:'agent',title:'追问已发送，续填连接待修复',impact:'飞书已接受卡片，但后续点击续填尚未绑定成功。',next:'保留已发送消息，核对卡片回调与会话版本，不重新发卡。'};
  if (expected.has(code)) return null;
  if (['master_binding_lost','unattempted_master_marker_conflict','mirror_payload_outside_whitelist'].includes(code)) return {...base,kind:'identity',severity:'severe',handling:'agent',title:'对接表写入对象发生冲突',impact:'记录绑定或可写字段不符合合同，继续写入可能影响错误对象。',next:'单独核对操作键、绑定与两侧记录，禁止强制写入或放宽权限。'};
  if (['unauthorized','cards_disabled','remote_batch_unavailable'].includes(code)) return {...base,kind:'access',title:code==='cards_disabled'?'待补卡片尚未启用':'待补项访问需要核对',impact:'未取得可用于追问的当前记录，本次未发送卡片。',next:'核对原账号、会话、卡片开关和表格访问权限；不要扩大授权范围。',actionLabel:'核对批次与权限'};
  if (code==='remote_quota_exhausted') return {...base,kind:'quota',title:'飞书本月调用额度已用尽',impact:'无法读取最新待补项，本次未发送追问卡片。',next:'管理员核对飞书调用额度与套餐；额度恢复后重新预览，反复重试无效。',actionLabel:'查看受影响批次'};
  if (code==='remote_rate_limited') return {...base,kind:'rate',title:'飞书请求暂时受限',impact:'本次未取得最新待补项，也未发送卡片。',next:'等待限流解除后重新预览，不连续提交。',actionLabel:'查看受影响批次'};
  if (result?.ok===false) return {...base,kind:'failure',escalate:true,title:'对接表操作未完成',impact:'当前操作没有成功回执，需要核对配置、权限或服务记录。',next:'先核对失败发生在哪一步；重复失败时交给智能体，不盲目重启。'};
  return null;
}

export function dockIncidentContext(kind) {
  const branches = {
    quota:'飞书月度额度：核对应用与租户的调用额度、套餐和错误码99991403。它不是短时限流；不要循环重试或更换模型Key。恢复后只读核对原批次，重新计算缺项，再由用户确认发送。',
    rate:'短时限流：核对99991400或HTTP429的实际响应，检查调用频率与在途请求，避免并发重试。',
    outcome:'结果未知：按原批次/操作键查本地回执、个人表与总表，区分未执行、已成功和未知。先查询后决定是否续跑；成功行绝不重写。',
    callback:'卡片已被飞书接受：查发送回执、原会话版本和回调绑定；接受不等于送达。修复续填关联，不以重新发卡替代核对。',
    failure:'从原操作记录定位具体错误，再检查当前配置来源、账号与表权限、服务和依赖。读取失败、业务拒绝与写入未知必须分开。',
    access:'按批次原账号和原会话查授权、卡片开关、个人表与总表分享权限。只修复已确认缺失的配置，不扩大权限、不用历史缺项发卡。',
    identity:'停止本对象写入，核对操作键、marker、账号、个人表和总表记录身份；保留冲突证据，不删除账本或修改白名单绕过校验。',
    service:'核对AFTB-Bot进程、启动配置与最近连接记录。服务启动后验证原失败环节，不把Running当成消息与写表正常。',
    reload:'配置已保存但等待生效：核对保存版本与运行版本，确认后重载；用原受影响操作验证，勿自动发送业务消息。',
  };
  return branches[kind] || '先读取当前绑定、指定批次逐行回执与双表同步账本；历史失败不等于当前故障。';
}
