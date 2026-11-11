// Local collection health is independent of the platform's deployment stage.
export async function prismCardSummary({collection, localCards, fetchPreview = () => fetch('http://127.0.0.1:4173/api/demo/snapshot.json', {signal:AbortSignal.timeout(5000)})}) {
  const issues = [], facts = [];
  const imageJob = collection.jobs.find(j => j.kind === 'images');
  const notesJob = collection.jobs.find(j => j.kind === 'notes');
  const latestArchive = collection.archives[0];
  const channel = localCards.find(c => c.id === 'jyq');
  const media = localCards.find(c => c.id === 'images');
  function jobFact(job, label) {
    if (!job) return null;
    const state = {running:'正在下载',complete:'最近下载完成',partial:'最近下载部分失败',failed:'最近下载失败',unknown:'上次下载结果待核对'}[job.status] || '结果待核对';
    if (['partial','failed','unknown'].includes(job.status)) issues.push(`${label}：${job.message || state}`);
    return `${label}${state}`;
  }
  facts.push(jobFact(imageJob, '图片') || '图片尚无手动下载记录');
  if (channel?.issue) issues.push(`图片自动采集：${channel.issue}`);
  if (media?.issue) issues.push(`图片归档：${media.issue}`);
  const archiveNewer = latestArchive && (!notesJob || Date.parse(latestArchive.createdAt) > Date.parse(notesJob.createdAt));
  const quota = archiveNewer ? latestArchive.errors?.some(e => e.error?.includes('额度')) : notesJob?.message?.includes('额度');
  if (quota) {
    facts.push('笔记下载受阻：飞书额度已用尽');
    issues.push('飞书本月 API 额度已用尽；已有笔记可继续使用，额度恢复后再下载');
  } else if (archiveNewer) {
    const complete = latestArchive.status === 'complete' && latestArchive.normalized;
    facts.push(complete ? '笔记最近下载完成' : '笔记归档待处理');
    if (!complete) issues.push('最近笔记归档未完整完成下载与结构化，请核对失败项');
  } else facts.push(jobFact(notesJob, '笔记') || '笔记尚无下载记录');
  let preview, previewOk = false;
  try {
    const response = await fetchPreview();
    if (!response.ok) throw Error();
    preview = await response.json();
    if (!Array.isArray(preview.sourceNotes) || !Array.isArray(preview.mediaManifest)) throw Error();
    previewOk = true;
    facts.push(`本地预览可读 ${preview.sourceNotes.length} 篇笔记`);
    for (const warning of preview.localWarnings || []) issues.push(`本地预览：${warning}`);
  } catch {
    facts.push('本地预览无法连接');
    issues.push('本地 Prism 预览无法连接，请检查本机展示服务');
  }
  return {id:'prism',source:'本地采集任务、归档清单、Prism 只读预览接口',status:'observed',
    fact: quota ? `飞书额度已用尽 · ${previewOk ? '已有资料仍可浏览' : '本地预览无法连接'}` : issues.length ? `${facts.find(f=>/失败|待处理|受阻|无法/.test(f)) || '资料采集需处理'} · ${issues.length} 项提醒` : facts.join(' · '),
    summary:facts.join(' · '),
    alerts:issues, sections:[{title:'图片采集',text:[facts[0],channel?.fact,media?.fact].filter(Boolean).join(' · ')},{title:'教学笔记下载',text:facts[1]},{title:'教学资料预览',text:facts[2]},{title:'平台阶段',text:'待部署与培训'}],
    detail:[...facts, channel?.fact, media?.fact, ...issues, `图片任务时间：${imageJob?.completedAt || imageJob?.createdAt || '无'}；笔记任务时间：${notesJob?.completedAt || latestArchive?.completedAt || notesJob?.createdAt || '无'}（来源记录含时区）`, '平台待部署与培训，不作为运行故障。本地预览可读不代表生产访问权限或教师使用已验收。', '常规处理：在资料与入库核对下载结果；额度恢复后重试。无法定位或反复失败时，将 Prism 卡片拖入处理区交给智能体排查。'].filter(Boolean).join('\n'),
    ...(issues.length ? {issue:issues.join('；'),severity:quota && issues.length === 1 ? 'normal' : 'unknown'} : {})};
}
