export const CATEGORIES = [
  "业务应用",
  "自动任务",
  "数据资产",
  "共享服务",
  "连接与资源",
  "开发能力",
];
const audit = "docs/WORKBENCH-LIVE-AUTOMATION-AUDIT-20261107.md";
export const ASSETS = [
  {id:'geo',category:1,name:'GEO 自动撰稿',summary:'OpenClaw 内容生产与成稿检查',fact:'正在读取撰稿结果…',source:'D:/Dev/openclaw-geo/README.md',detail:'读取实际 Windows 调度、写稿回执与文件。成稿不等于发布，当前流程不自动发布。'},
  {id:'sales-sources',category:2,name:'销售知识资料',summary:'业务原件、知识原料与提示词参考',fact:'原件归档与整理去向',source:'workbench-prototype-v3/docs/SOURCE-LIBRARY.md',detail:'按用途保存原件及来源；整理稿关联原件，发布另行审阅。内部录音转写与实现记录不自动入库。'},
  {
    id: "sales",
    category: 0,
    name: "销售助手",
    summary: "私域销售支持",
    fact: "模型余额待查询",
    source: "docs/WORKBENCH-SALES-DASHBOARD-SOURCES-20261107.md",
    detail:
      "设备授权、回复生成、客户画像、团队物料与知识更新。进程或接口可用不代表顾问已获得有效结果。",
  },
  {
    id: "prism",
    category: 0,
    name: "Prism 教学平台",
    summary: "教研资料与题库维护",
    fact: "正在读取本地数据源…",
    source: "docs/WORKBENCH-PRISM-DASHBOARD-SOURCES-20261107.md",
    detail: "资料采集、图片完整性、权限与检索服务、教学消费应分别观察。",
  },
  {
    id: "bridge",
    category: 0,
    name: "对接表 Agent",
    summary: "跨系统字段映射与同步",
    fact: "正在读取写入回执…",
    source: "docs/WORKBENCH-DOCK-DASHBOARD-SOURCES-20261107.md",
    detail:
      "消息处理、实际表格写入、结果未知、批量导入与双表权限。收到请求不等于写入成功。",
  },
  {
    id: "jyq",
    category: 1,
    name: "教研图片采集",
    summary: "微信群资料采集到本地",
    fact: "正在读取采集任务…",
    source: audit,
    detail:
      "读取定时任务、查询通道与采集回执；单群补采和全群定时结果分别展示。",
  },
  {
    id: "reports",
    category: 1,
    name: "日报与汇总提醒",
    summary: "PDDR / PXKB 自动工作流",
    fact: "正在读取近期执行记录…",
    source: audit,
    detail:
      "读取日报与汇总流程的近期执行、当前阻塞与触发方式；外部触发流程无执行不自动判故障。",
  },
  {
    id: "portraits",
    category: 2,
    name: "销售助手画像",
    summary: "助手画像的本地同步副本",
    fact: "正在读取画像同步记录…",
    source: audit,
    detail:
      "SASALELE-Portrait-Sync 从远端拉取画像。本地 CSV 有更新，不证明画像质量或业务消费效果；与旧方舟→飞书画像链不是同一条链。",
  },
  {
    id: "images",
    category: 2,
    name: "教研图片集",
    summary: "已采集图片及来源索引",
    fact: "完整性与消费待核实",
    source: audit,
    detail:
      "JYQ manifest 记录存在。尚未核验每张图片可读、重复率和 Prism 实际消费情况；不读取无关聊天正文。",
  },
  {
    id: "n8n",
    category: 3,
    name: "n8n",
    summary: "跨项目工作流执行平台",
    fact: "正在读取容器状态…",
    source: audit,
    detail:
      "读取工作流平台容器与就绪检查；平台可用与业务成功分别观察。",
  },
  {
    id: "bots",
    category: 3,
    name: "Bot 与任务服务",
    summary: "AFTB / PXKB / Job HTTP",
    fact: "正在读取服务状态…",
    source: audit,
    detail:
      "读取对接表、观测及日报机器人服务状态，业务结果以各应用回执为准。",
  },
  {
    id: "connections",
    category: 4,
    name: "飞书与模型连接",
    summary: "外部平台与模型配置",
    fact: "正在读取模型账户余额…",
    source: "工作台模型连接余额观测",
    detail:
      "按业务用途显示模型账户最近余额与查询时间；飞书配额属于独立观测，不从模型余额推断。",
  },
  {
    id: "deploy",
    category: 5,
    name: "销售助手部署资料",
    summary: "部署脚本、资源清单与接手说明",
    fact: "可复用 · 环境需验证",
    source: "project/modules/qm-sales-assistant/deploy/README.md",
    detail:
      "供智能体先查环境、依赖、数据与物料范围。资料存在不代表任意目标服务器已验证可迁移。",
  },
];
const observedAssets = new Map();
export function registerObservedAssets(items) {
  for (const item of items) if (item.id?.startsWith('incident:')) observedAssets.set(item.id, item);
}
export function registerCardObservations(items) {
  for (const item of items || []) {
    const base = ASSETS.find(a => a.id === item.id);
    if (base) observedAssets.set(item.id, {...base, issue:false, severity:undefined, ...item, summary:base.summary});
  }
}
const retiredProfile={id:'feishu-profile',category:2,name:'飞书历史画像（已退役）',retired:true,summary:'退出后续建设',fact:'已从资产区下架',detail:'历史引用保留，不恢复此链路，不删除原始数据。',source:'docs/SASALELE-AFTB-NEAR-TERM-PLAN-20261106.md'};
export const asset = (id) => observedAssets.get(id) || ASSETS.find((a) => a.id === id) || (id===retiredProfile.id?retiredProfile:undefined);

export const cardContext = {
  sales: "覆盖设备授权、回复生成、客户画像与团队物料。",
  prism: "关联资料采集、图片完整性、检索权限与教学使用。",
  bridge: "关注实际写入、待核对结果、Excel 批次与双表权限。",
  jyq: "影响 Prism 新资料补充；失败原因尚未定位。",
  reports: "涉及 PDDR 日报和 PXKB 汇总提醒；不代表历史从未成功。",
  portraits: "远端助手画像的本地副本；不是旧方舟→飞书画像链。",
  "feishu-profile": "覆盖范围、质量及是否被新画像替代，待核实。",
  images: "已有来源索引；图片可读性、重复率与实际使用待核实。",
  n8n: "承载跨项目自动任务；平台运行不等于任务成功。",
  bots: "支撑对接表与任务处理；业务完成情况尚未贯通观测。",
  connections: "飞书、方舟及模型配置入口；不读取或显示 Key。",
  deploy: "含部署脚本与资源清单；目标环境仍需单独验证。",
};
