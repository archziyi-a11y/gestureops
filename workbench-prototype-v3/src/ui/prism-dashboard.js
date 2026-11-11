export function prismDashboard() {
  const areas = [
    ['来源是否持续更新', '微信采集与飞书同步', '最近批次：待采集 · 同步失败：未知',
      '微信图片/笔记卡片由独立教研归档模块采集；飞书 Job 可报告 dry-run、入库响应与图片失败。两个来源不合并计数。',
      'jyq/room_fetch.py、manifest.py；prism_sync/job_server.py。任务退出成功不等于全部媒体成功，更不代表已进入 Prism。'],
    ['资料是否真的可用', '入库与图片完整性', '入库数量：未知 · 图片缺失：未知',
      '笔记事件与媒体上传分别核验。保留原笔记、正式笔记、微信素材的来源；缩略图不能当作已取得原图。',
      'prism_ingestion/server.py；read_api/production.py、readonly_store.py。accepted、duplicate、accepted_with_warnings 应分列，重复不算新增。'],
    ['谁能看到什么', '访问权限与读取服务', '部署观测：未接入 · 权限探测：未执行',
      '代码已具备身份会话、ACL 与生产只读仓储。按教师归属、科目和笔记类型限制读取，不能用 Demo 角色切换证明真实权限。',
      'read_api/acl.py、identity.py、cookie_middleware.py。2026-09-23 的交接记录仍注明部署待确认，不开放公网。'],
    ['积累有没有被使用', '备课与资料消费', '教师取用：未观测 · 来源关联：待核对',
      '先核对采集清单能否对应平台资源，再用一个备课主题验证能否找到并打开资料。没有消费记录不显示零使用。',
      '本次未确认现成的跨来源消费汇总接口；需要资源索引对应和经授权的使用验证。采集量不能替代教学效果。']
  ];
  return `<section class="sales-observation">
    <div class="sales-status"><div><p class="eyebrow">当前观测</p><h2>采集、入库与教师可用性尚未贯通观测</h2><p>来源更新 → 资产入库 → 权限读取 → 备课取用</p></div><span class="chip">未接入</span></div>
    <div class="sales-summary"><strong>最近交接记录 · 2026-09-23</strong><p>同步与只读 API 已有实现和测试记录；部署、日常自动刷新与正式消费仍需分别确认。不是今日运行结论。</p></div>
    <div class="sales-areas">${areas.map(([question,title,state,description,source])=>`<section class="sales-area"><p class="eyebrow">${question}</p><h3>${title}</h3><p>${state}</p><details><summary>查看范围与依据</summary><p>${description}</p><p class="mono">${source}</p></details></section>`).join('')}</div>
    <details class="watch-details"><summary>观测口径</summary><p>同步批次需保留来源、时间范围、dry-run/实写、事件接收及媒体失败。微信采集调度和 Prism 同步调度是独立任务；不能因前者运行而宣称后者已启用。</p><p>时间展示用北京时间；区分源消息发生时间、采集完成时间、平台入库时间和最近观测。当前未读取生产数据库、任务调度器或教师访问记录，未填历史总量作实时指标。</p></details>
  </section>`;
}
