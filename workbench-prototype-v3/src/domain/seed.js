// 初始事实：三个真实形状的合成项目 + 一件等待准备的迁移作业。
// 时间、条目、编号全部是合成数据；不连接生产、不读真实凭据、不执行真实迁移。
import { iso } from './time.js';

export const SCHEMA_VERSION = 'v3.0';

export const SCOPE_KEYS = ['code', 'config', 'db', 'materials'];
export const SCOPE_LABELS = {
  code: '代码',
  config: '配置',
  db: '数据库',
  materials: '团队物料'
};

export function makeInitialState(now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    activeProjectId: 'sales',

    // 可改变的模拟条件：改了就说明之前的检查结论不再成立。
    conditions: {
      targetReachable: 'reachable', // reachable | unreachable
      credentialState: 'valid' // valid | rejected
    },
    conditionsChangedAt: now,

    slots: ['sales', 'prism', 'bridge', null],

    targets: [
      {
        id: 'isl-02',
        name: 'isl-02 · 上海隔离区',
        region: '上海',
        endpoint: 'ssh://isl-02.internal:22',
        note: '2026-10 起在用 · 单次作业',
        retired: false
      },
      {
        id: 'isl-03',
        name: 'isl-03 · 北京隔离区',
        region: '北京',
        endpoint: 'ssh://isl-03.internal:22',
        note: '2026-11 新建 · 尚未验证过迁移',
        retired: false
      },
      {
        id: 'isl-01',
        name: 'isl-01 · 深圳隔离区',
        region: '深圳',
        endpoint: 'ssh://isl-01.internal:22',
        note: '2026-08 已下线 · 切过去会发生什么，本原型会如实记录',
        retired: true
      }
    ],

    credentials: [
      {
        id: 'local-key-ref-02',
        label: 'local-key-ref-02',
        note: '2026-10 建立 · 未读取内容'
      },
      {
        id: 'local-key-ref-03',
        label: 'local-key-ref-03',
        note: '2026-11 建立 · 尚未使用'
      }
    ],

    projects: [
      {
        id: 'sales',
        name: '销售助手',
        purpose: '私域销售支持',
        indexRef: 'PROJECT-INDEX.md#sales',
        jobId: 'JOB-2406',
        workfaces: [
          { id: 'migrate', label: '部署与迁移', detail: '隔离目标、范围、授权、交接', live: true },
          { id: 'conn', label: '画像连接', detail: '连接 atl-02 失败待修（下一批接入）', live: false },
          { id: 'knowledge', label: '知识资料', detail: '版本与发布（下一批接入）', live: false },
          { id: 'profile', label: '画像对照', detail: '来源、字段、消费情况（下一批接入）', live: false },
          { id: 'records', label: '项目记录', detail: '本作业的历史事件', live: true, href: '#/records' }
        ],
        service: {
          state: 'online',
          endpoints: '3 / 3',
          detail: '端点响应正常（模拟）',
          checkedAt: now - 23 * 60 * 1000
        },
        output: {
          state: 'unknown',
          value: '—',
          detail: '未观测到产出事件',
          at: null
        },
        outputRows: [
          {
            at: now - 26 * 60 * 1000,
            item: '新建线索分层 · 18 条',
            result: 'ok',
            source: '模拟执行器'
          },
          {
            at: now - 74 * 60 * 1000,
            item: '话术质检 · 24 项',
            result: 'partial',
            detail: '22 / 24',
            source: '模拟执行器'
          },
          {
            at: now - 176 * 60 * 1000,
            item: '画像更新 · 工作号 12 个',
            result: 'failed',
            detail: '连接 atl-02',
            source: '模拟执行器'
          },
          {
            at: null,
            item: '团队物料传输',
            result: 'unknown',
            detail: '本次作业尚未执行',
            source: 'JOB-2406'
          }
        ],
        pendingStatic: [
          {
            label: '画像更新失败',
            tone: 'danger',
            detail: '连接 atl-02 · 12 个工作号未写入'
          }
        ]
      },
      {
        id: 'prism',
        name: 'Prism 教学平台',
        purpose: '教研资料与题库维护',
        indexRef: 'PROJECT-INDEX.md#prism',
        jobId: null,
        workfaces: [],
        service: {
          state: 'online',
          endpoints: '2 / 2',
          detail: '端点响应正常（模拟）',
          checkedAt: now - 31 * 60 * 1000
        },
        output: {
          state: 'ok',
          value: '22 / 24',
          detail: '最近一次采集部分完成',
          at: now - 95 * 60 * 1000
        },
        outputRows: [
          {
            at: now - 95 * 60 * 1000,
            item: '课程图片采集 · 24 项',
            result: 'partial',
            detail: '22 / 24',
            source: '模拟执行器'
          },
          {
            at: now - 210 * 60 * 1000,
            item: '题库同步 · 140 题',
            result: 'ok',
            source: '模拟执行器'
          }
        ],
        pendingStatic: [
          {
            label: '图片采集部分完成',
            tone: 'warn',
            detail: '22 / 24 · 2 项需要补采'
          }
        ]
      },
      {
        id: 'bridge',
        name: '对接表 Agent',
        purpose: '跨系统字段映射与同步',
        indexRef: 'PROJECT-INDEX.md#bridge',
        jobId: null,
        workfaces: [],
        service: {
          state: 'online',
          endpoints: '1 / 1',
          detail: '端点响应正常（模拟）',
          checkedAt: now - 44 * 60 * 1000
        },
        output: {
          state: 'unknown',
          value: '—',
          detail: '最近 14:05 后无产出事件',
          at: now - 265 * 60 * 1000
        },
        outputRows: [
          {
            at: now - 265 * 60 * 1000,
            item: '对接表同步 · 36 行',
            result: 'ok',
            source: '模拟执行器'
          },
          {
            at: null,
            item: '字段映射校验',
            result: 'unknown',
            detail: '无产出事件',
            source: '模拟执行器'
          }
        ],
        pendingStatic: []
      }
    ],

    jobs: {
      'JOB-2406': {
        id: 'JOB-2406',
        projectId: 'sales',
        kind: 'migration',
        title: '隔离环境迁移',
        purpose: '把销售助手迁到隔离目标，并核对业务产出',
        skill: 'sales-migration',
        createdAt: now - 52 * 60 * 1000,
        migration: {
          targetId: 'isl-02',
          credentialRefId: 'local-key-ref-02',
          scope: { code: true, config: true, db: true, materials: true },
          check: null,
          authorization: null,
          package: null,
          receipt: null,
          receiptsRejected: [],
          history: []
        }
      }
    },

    log: []
  };
}

export function seedStamp(now) {
  return iso(now);
}
