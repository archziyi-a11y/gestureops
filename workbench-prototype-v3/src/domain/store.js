// 作业事实的唯一来源：状态存在这里，刷新、换标签页、重启服务读到的都是同一份。
// 规则：配置一变（目标 / 凭据引用 / 范围 / 模拟条件）→ 检查、授权、提示词、回执全部失效。
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { makeInitialState, SCOPE_KEYS, SCOPE_LABELS, SCHEMA_VERSION } from './seed.js';
import { iso } from './time.js';

export const STAGE_META = {
  pending_check: { label: '待检查', tone: 'neutral', hint: '尚未检查迁移条件' },
  blocked: { label: '检查受阻', tone: 'danger', hint: '检查未通过，不能授权' },
  stale_check: { label: '检查已过期', tone: 'warn', hint: '条件或配置已变更，需要重新检查' },
  checked: { label: '检查通过 · 待授权', tone: 'warn', hint: '检查通过，尚未授权' },
  authorized: { label: '已授权 · 待生成提示词', tone: 'info', hint: '已授权，尚未生成提示词' },
  awaiting_handoff: { label: '待接手', tone: 'warn', hint: '已生成提示词，未收到接手回执' },
  ready: { label: '已接手（模拟）', tone: 'ok', hint: '回执校验通过' }
};

const RECEIPT_KIND = 'workbench.handoff.receipt';

export class Store {
  constructor({ dir = null, now = () => Date.now() } = {}) {
    this.dir = dir;
    this.file = dir ? join(dir, 'state.json') : null;
    this.now = now;
    this._seq = 0;
    this.state = this._load();
    if (!this.state) {
      this.state = makeInitialState(this.now());
      this._persist();
    }
    this._seq = Number(this.state.packageSeq || 0);
  }

  _load() {
    if (!this.file || !existsSync(this.file)) return null;
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'));
      if (raw.schemaVersion !== SCHEMA_VERSION) return null;
      return raw;
    } catch {
      return null;
    }
  }

  _persist() {
    if (!this.file) return;
    this.state.updatedAt = this.now();
    this.state.packageSeq = this._seq;
    try {
      mkdirSync(this.dir, { recursive: true });
      const tmp = this.file + '.tmp';
      writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
      renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] 写入失败：', err.message);
    }
  }

  // ---------- 读取 ----------
  project(id) {
    return this.state.projects.find((p) => p.id === id) || null;
  }

  job(id) {
    return this.state.jobs[id] || null;
  }

  target(id) {
    return this.state.targets.find((t) => t.id === id) || null;
  }

  credentialRef(id) {
    return this.state.credentials.find((c) => c.id === id) || null;
  }

  scopeList(m) {
    return SCOPE_KEYS.filter((k) => m.scope[k]).map((k) => SCOPE_LABELS[k]);
  }

  scopeSig(m) {
    return SCOPE_KEYS.map((k) => `${k}:${m.scope[k] ? 1 : 0}`).join(',');
  }

  // 条件也算配置的一部分：条件变了，之前的检查结论就不成立了。
  contextSig(m) {
    const c = this.state.conditions;
    return [m.targetId, m.credentialRefId, this.scopeSig(m), c.targetReachable, c.credentialState].join('|');
  }

  checkFresh(job) {
    const m = job.migration;
    return Boolean(m.check && m.check.contextSig === this.contextSig(m));
  }

  stage(job) {
    const m = job.migration;
    if (!m.check) return 'pending_check';
    if (m.check.status !== 'passed') return 'blocked';
    if (!this.checkFresh(job)) return 'stale_check';
    if (!m.authorization) return 'checked';
    if (!m.package) return 'authorized';
    if (!m.receipt) return 'awaiting_handoff';
    return 'ready';
  }

  attention(project) {
    // Attach the known incident to its work surface, including older saved demos.
    const items = (project.pendingStatic || []).map(item =>
      project.id === 'sales' && item.label === '画像更新失败' && item.detail.includes('atl-02')
        ? { ...item, workfaceId: 'conn' }
        : item);
    if (project.jobId) {
      const job = this.job(project.jobId);
      if (job) {
        const st = this.stage(job);
        if (st !== 'ready') {
          const meta = STAGE_META[st];
          items.unshift({
            label: `迁移作业 · ${meta.label}`,
            tone: meta.tone,
            detail: `${job.id} · ${meta.hint}`,
            href: `#/p/${project.id}/migrate`
          });
        }
      }
    }
    return items;
  }

  // ---------- 写入 ----------
  log(entry) {
    this.state.log.unshift({
      at: this.now(),
      actor: '同事 · 你',
      ...entry
    });
    if (this.state.log.length > 400) this.state.log.length = 400;
  }

  /** 配置变更：把检查 / 授权 / 提示词 / 回执一起作废，并留下可回看的事件。 */
  _invalidate(job, reason) {
    const m = job.migration;
    const hadSomething = Boolean(m.check || m.authorization || m.package || m.receipt);
    if (!hadSomething) return null;

    // 用事实本身描述「之前」，而不是用变化后的状态推回去。
    const before = m.receipt
      ? '已接手（模拟）'
      : m.package
        ? '待接手'
        : m.authorization
          ? '已授权'
          : m.check && m.check.status === 'passed'
            ? '检查通过'
            : '检查受阻';

    if (m.authorization) m.lastInvalidatedAuthorization = { targetId: m.authorization.targetId, at: m.authorization.at, reason };
    if (m.package) {
      // 记下「失效前那一份」到底属于哪个目标，后面才能演示旧回执为什么对不上。
      m.previous = {
        targetId: m.package.targetId,
        scopeSig: m.package.scopeSig,
        packageId: m.package.id,
        at: m.package.at
      };
    }
    m.check = null;
    m.authorization = null;
    m.package = null;
    m.receipt = null;

    this.log({
      projectId: job.projectId,
      jobId: job.id,
      action: '旧检查与授权失效',
      target: '本次迁移作业',
      scope: reason,
      before,
      after: '待检查（需重新检查）',
      source: '作业规则（配置绑定）',
      next: '重新检查迁移条件',
      actor: '系统规则'
    });
    return reason;
  }

  // ---------- 动作 ----------
  act(type, payload = {}) {
    const handler = this[`_${type}`];
    if (typeof handler !== 'function') {
      return { ok: false, level: 'error', message: `未知操作：${type}` };
    }
    const res = handler.call(this, payload) || { ok: true };
    this._persist();
    return res;
  }

  _set_project({ projectId }) {
    if (!this.project(projectId)) return { ok: false, level: 'error', message: '项目不存在。' };
    this.state.activeProjectId = projectId;
    return { ok: true, message: `已切到「${this.project(projectId).name}」。` };
  }

  _set_target({ jobId, targetId }) {
    const job = this.job(jobId);
    const target = this.target(targetId);
    if (!job || !target) return { ok: false, level: 'error', message: '作业或目标不存在。' };
    const m = job.migration;
    if (m.targetId === targetId) return { ok: true, message: '目标未变化。' };

    const before = this.target(m.targetId);
    m.targetId = targetId;
    this.log({
      projectId: job.projectId,
      jobId: job.id,
      action: '变更迁移目标',
      target: target.name,
      scope: '目标变更',
      before: before ? before.name : '—',
      after: target.name,
      source: '界面操作',
      next: '重新检查迁移条件'
    });
    const invalidated = this._invalidate(job, '目标已变更：旧检查、授权、提示词与回执都不再对应当前配置');
    return {
      ok: true,
      level: invalidated ? 'warn' : 'ok',
      message: invalidated
        ? `已切到 ${target.name}。${invalidated}，需要重新检查。`
        : `已切到 ${target.name}。`
    };
  }

  _set_credential({ jobId, refId }) {
    const job = this.job(jobId);
    const ref = this.credentialRef(refId);
    if (!job || !ref) return { ok: false, level: 'error', message: '作业或凭据引用不存在。' };
    const m = job.migration;
    if (m.credentialRefId === refId) return { ok: true, message: '凭据引用未变化。' };

    const before = this.credentialRef(m.credentialRefId);
    m.credentialRefId = refId;
    this.log({
      projectId: job.projectId,
      jobId: job.id,
      action: '变更凭据引用',
      target: ref.label,
      scope: '仅切换引用标识，不读取任何密钥内容',
      before: before ? before.label : '—',
      after: ref.label,
      source: '界面操作',
      next: '重新检查迁移条件'
    });
    const invalidated = this._invalidate(job, '凭据引用已变更：旧检查、授权、提示词与回执都不再对应当前配置');
    return {
      ok: true,
      level: invalidated ? 'warn' : 'ok',
      message: invalidated ? `已切到 ${ref.label}。${invalidated}，需要重新检查。` : `已切到 ${ref.label}。`
    };
  }

  _toggle_scope({ jobId, key }) {
    const job = this.job(jobId);
    if (!job) return { ok: false, level: 'error', message: '作业不存在。' };
    if (!SCOPE_KEYS.includes(key)) return { ok: false, level: 'error', message: '未知范围项。' };
    const m = job.migration;
    const before = this.scopeList(m).join('、') || '空';
    m.scope[key] = !m.scope[key];
    const after = this.scopeList(m).join('、') || '空';
    this.log({
      projectId: job.projectId,
      jobId: job.id,
      action: '调整迁移范围',
      target: SCOPE_LABELS[key],
      scope: '范围变更',
      before,
      after,
      source: '界面操作',
      next: '重新检查迁移条件'
    });
    const invalidated = this._invalidate(job, '迁移范围已变更：旧检查、授权、提示词与回执都不再对应当前配置');
    return {
      ok: true,
      level: invalidated ? 'warn' : 'ok',
      message: invalidated ? `范围已更新为 ${after}。${invalidated}。` : `范围已更新为 ${after}。`
    };
  }

  _set_condition({ key, value }) {
    const allowed = {
      targetReachable: ['reachable', 'unreachable'],
      credentialState: ['valid', 'rejected']
    };
    if (!allowed[key] || !allowed[key].includes(value)) {
      return { ok: false, level: 'error', message: '未知的模拟条件。' };
    }
    this.state.conditions[key] = value;
    this.state.conditionsChangedAt = this.now();
    const job = this.job('JOB-2406');
    this.log({
      projectId: job.projectId,
      jobId: job.id,
      action: '变更模拟条件',
      target: key === 'targetReachable' ? '目标可达性' : '凭据可用性',
      scope: '只影响本地模拟检查结果',
      before: '—',
      after:
        key === 'targetReachable'
          ? value === 'reachable'
            ? '目标可达'
            : '目标不可达'
          : value === 'valid'
            ? '凭据可用'
            : '凭据被拒绝',
      source: '界面操作（仅影响模拟检查结果）',
      next: '重新检查迁移条件'
    });
    const invalidated = this._invalidate(job, '模拟条件已变更：之前的检查结论不再成立');
    return {
      ok: true,
      level: invalidated ? 'warn' : 'ok',
      message: invalidated
        ? '模拟条件已改变，之前的检查与授权失效，需要重新检查。'
        : '模拟条件已改变。'
    };
  }

  _run_check({ jobId }) {
    const job = this.job(jobId);
    if (!job) return { ok: false, level: 'error', message: '作业不存在。' };
    const m = job.migration;
    const cond = this.state.conditions;
    const reachable = cond.targetReachable === 'reachable';
    const credOk = cond.credentialState === 'valid';
    const items = [];

    items.push({
      id: 'connectivity',
      label: '目标连接',
      state: reachable ? 'ok' : 'failed',
      detail: reachable
        ? `隔离目标响应正常（模拟，耗时 180ms）· ${this.target(m.targetId).endpoint}`
        : '连接超时：隔离目标不可达（模拟）'
    });

    if (!reachable) {
      ['permission', 'dependency', 'space', 'dataLocation'].forEach((id) => {
        items.push({
          id,
          label: LABELS[id],
          state: 'unchecked',
          detail: '前序检查未通过，本次未检查'
        });
      });
    } else {
      items.push({
        id: 'permission',
        label: LABELS.permission,
        state: credOk ? 'ok' : 'failed',
        detail: credOk
          ? `凭据引用 ${this.credentialRef(m.credentialRefId).label} 被接受；具备代码/配置/数据库/物料写入权限（模拟）`
          : '凭据引用被拒绝（401，模拟）；未获得写入权限'
      });
      const rest = !credOk;
      const push = (id, detail) =>
        items.push({
          id,
          label: LABELS[id],
          state: rest ? 'unchecked' : 'ok',
          detail: rest ? '前序检查未通过，本次未检查' : detail
        });
      push('dependency', '运行时 Node 20、数据库扩展版本匹配（模拟）');
      push('space', '可用 180 GB，预计占用 42 GB（模拟）');
      push('dataLocation', '生产数据仍在原环境，本次未复制任何数据');
    }

    const failed = items.filter((i) => i.state === 'failed');
    const hadCheck = m.check ? (m.check.status === 'passed' ? '检查通过' : '检查受阻') : '未检查';
    m.check = {
      at: this.now(),
      status: failed.length ? 'blocked' : 'passed',
      items,
      contextSig: this.contextSig(m),
      targetId: m.targetId,
      credentialRefId: m.credentialRefId,
      scopeSig: this.scopeSig(m)
    };
    // 重新检查会作废之前的授权：授权是独立事件，检查变了就得重新给。
    m.authorization = null;
    m.package = null;
    m.receipt = null;

    this.log({
      projectId: job.projectId,
      jobId: job.id,
      action: failed.length ? '检查迁移条件（受阻）' : '检查迁移条件（通过）',
      target: this.target(m.targetId).name,
      scope: '只检查连接、权限、依赖、空间、数据位置；不复制数据',
      before: hadCheck,
      after: failed.length ? `受阻：${failed[0].label}失败` : '五项检查全部通过',
      source: '检查器 check-migration@0.4（模拟）',
      next: failed.length ? '按失败项修改条件或配置后重新检查' : '授权本次隔离作业'
    });

    return {
      ok: failed.length === 0,
      level: failed.length ? 'error' : 'ok',
      message: failed.length
        ? `检查受阻：${failed.map((i) => `${i.label}（${i.detail}）`).join('；')}。留在本页修改即可。`
        : '检查通过：连接、权限、依赖、空间、数据位置均满足（模拟）。没有复制任何数据。'
    };
  }

  _authorize({ jobId, note = '' }) {
    const job = this.job(jobId);
    if (!job) return { ok: false, level: 'error', message: '作业不存在。' };
    const m = job.migration;
    if (!m.check) return { ok: false, level: 'error', message: '还没检查，不能授权。' };
    if (m.check.status !== 'passed') return { ok: false, level: 'error', message: '检查未通过，不能授权。' };
    if (!this.checkFresh(job)) return { ok: false, level: 'error', message: '配置已变更，检查结论过期；请重新检查后再授权。' };

    m.authorization = {
      at: this.now(),
      by: '同事 · 你',
      note: note || '授权在隔离目标执行本次模拟迁移',
      targetId: m.targetId,
      credentialRefId: m.credentialRefId,
      scopeSig: this.scopeSig(m),
      contextSig: this.contextSig(m),
      checkAt: m.check.at
    };
    this.log({
      projectId: job.projectId,
      jobId: job.id,
      action: '授权本次隔离作业',
      target: this.target(m.targetId).name,
      scope: `${this.scopeList(m).join('、')} · ${this.credentialRef(m.credentialRefId).label}`,
      before: '未授权',
      after: '已授权（绑定当前目标 / 凭据 / 范围）',
      source: '界面操作',
      next: '生成并复制交接提示词'
    });
    return { ok: true, message: '已授权本次隔离作业。授权只覆盖这一次，换了目标或范围就作废。' };
  }

  _build_prompt({ jobId }) {
    const job = this.job(jobId);
    if (!job) return { ok: false, level: 'error', message: '作业不存在。' };
    const m = job.migration;
    if (!m.authorization) return { ok: false, level: 'error', message: '未授权，不能生成提示词。' };
    if (!this.checkFresh(job)) return { ok: false, level: 'error', message: '检查结论已过期，请重新检查并授权。' };

    const ctx = this.contextSig(m);
    if (m.package && m.package.contextSig === ctx) {
      return {
        ok: true,
        level: 'info',
        message: '提示词与当前配置一致，未重新生成。复制不等于派发，作业仍是待接手。',
        promptText: this.promptText(job),
        reused: true
      };
    }

    this._seq += 1;
    const packageId = `PKG-${job.id}-${String(this._seq).padStart(2, '0')}`;
    m.package = {
      id: packageId,
      at: this.now(),
      contextSig: ctx,
      targetId: m.targetId,
      credentialRefId: m.credentialRefId,
      scopeSig: this.scopeSig(m),
      scope: this.scopeList(m)
    };
    m.receipt = null;

    this.log({
      projectId: job.projectId,
      jobId: job.id,
      action: '生成交接提示词',
      target: packageId,
      scope: `${this.target(m.targetId).name} · ${this.scopeList(m).join('、')}`,
      before: '已授权',
      after: '提示词已生成（作业仍为待接手）',
      source: '本地生成（无上传、无派发）',
      next: '等待与本次作业匹配的接手回执'
    });

    return {
      ok: true,
      message: '提示词已生成并复制。作业仍是待接手——复制不是派发，也不是执行。',
      promptText: this.promptText(job)
    };
  }

  _import_receipt({ jobId, raw }) {
    const job = this.job(jobId);
    if (!job) return { ok: false, level: 'error', message: '作业不存在。' };
    const m = job.migration;
    if (!m.package) {
      return { ok: false, level: 'error', message: '还没有生成提示词，没有可对照的接手包编号，不能接收回执。' };
    }

    let parsed;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      this._reject(job, '回执不是有效 JSON');
      return { ok: false, level: 'error', message: '回执不是有效 JSON，作业仍为待接手。' };
    }
    if (!parsed || typeof parsed !== 'object') {
      this._reject(job, '回执不是对象');
      return { ok: false, level: 'error', message: '回执格式不对，作业仍为待接手。' };
    }

    const reasons = [];
    if (parsed.kind !== RECEIPT_KIND) reasons.push('类型不匹配');
    if (parsed.jobId !== job.id) reasons.push(`作业编号不一致（回执为 ${parsed.jobId || '空'}）`);
    if (parsed.packageId !== m.package.id) reasons.push(`接手包编号不一致（回执为 ${parsed.packageId || '空'}）`);
    if (parsed.targetId !== m.targetId) reasons.push(`目标不一致（回执为 ${parsed.targetId || '空'}）`);
    if (parsed.scopeSig !== this.scopeSig(m)) reasons.push('范围签名不一致');

    if (reasons.length) {
      this._reject(job, reasons.join('；'));
      return {
        ok: false,
        level: 'error',
        message: `回执未通过校验：${reasons.join('；')}。作业仍为待接手。`
      };
    }

    m.receipt = {
      at: this.now(),
      receiptId: parsed.receiptId || 'RCPT-UNNAMED',
      issuedBy: parsed.issuedBy || '接手端（模拟）',
      issuedAt: parsed.issuedAt || null,
      jobId: parsed.jobId,
      packageId: parsed.packageId,
      targetId: parsed.targetId,
      scopeSig: parsed.scopeSig
    };

    this.log({
      projectId: job.projectId,
      jobId: job.id,
      action: '收到接手回执',
      target: `${m.receipt.receiptId}（${m.receipt.issuedBy}）`,
      scope: `作业 ${parsed.jobId} · 包 ${parsed.packageId}`,
      before: '待接手',
      after: '已接手（模拟）',
      source: '本地导入（手工触发）',
      next: '（下一批）在隔离目标执行模拟迁移'
    });

    return {
      ok: true,
      message: '回执校验通过：作业变为「已接手（模拟）」。授权与接手是两个独立事件，都已写入作业记录。'
    };
  }

  _reject(job, reason) {
    job.migration.receiptsRejected.unshift({ at: this.now(), reason });
    this.log({
      projectId: job.projectId,
      jobId: job.id,
      action: '回执未通过校验',
      target: '接手回执',
      scope: '作业编号 / 包编号 / 目标 / 范围签名',
      before: STAGE_META[this.stage(job)].label,
      after: STAGE_META[this.stage(job)].label,
      source: '本地导入（手工触发）',
      next: '用与本次配置匹配的回执重试',
      actor: '系统规则'
    });
  }

  _reset() {
    this.state = makeInitialState(this.now());
    this._seq = 0;
    return { ok: true, message: '已回到初始状态。' };
  }

  // ---------- 提示词与回执样本 ----------
  promptText(job) {
    const m = job.migration;
    const pkg = m.package;
    const project = this.project(job.projectId);
    const target = this.target(m.targetId);
    const block = {
      kind: RECEIPT_KIND,
      jobId: job.id,
      packageId: pkg ? pkg.id : 'PKG-未生成',
      targetId: m.targetId,
      scopeSig: this.scopeSig(m)
    };
    return [
      `【工作对象】${project.name}（${project.indexRef}）· 索引 AGENT-INDEX.md`,
      `【作业】${job.id} · ${job.title} · 单次`,
      `【目标】${target.name} · ${target.endpoint}`,
      `【凭据引用】${this.credentialRef(m.credentialRefId).label}（仅引用，提示词内不含密钥）`,
      `【范围】${this.scopeList(m).join('、')}`,
      `【边界】源环境只读；只做这一次；不改调度；不写生产`,
      `【回执要求】完成后回执须带上下面校验块，字段与值原样带回；不匹配不推进作业`,
      `【未知项】无法确认就写「未观测」，不要写成已完成`,
      '',
      '--- 校验块（回执原样带回） ---',
      JSON.stringify(block, null, 2)
    ].join('\n');
  }

  receiptSample(jobId, kind) {
    const job = this.job(jobId);
    if (!job) return null;
    const m = job.migration;
    if (!m.package) return null;

    if (kind === 'wrong-job') {
      return {
        kind: RECEIPT_KIND,
        receiptId: 'RCPT-OTHER-2401',
        jobId: 'JOB-2399',
        packageId: m.package.id,
        targetId: m.targetId,
        scopeSig: this.scopeSig(m),
        issuedBy: '接手端 · 其它作业（模拟）',
        issuedAt: iso(this.now()),
        note: '故意错配其它作业的回执：用来验证「作业编号不一致」会不会被拦住。'
      };
    }

    if (kind === 'stale') {
      const prev = m.previous;
      if (!prev) return null;
      return {
        kind: RECEIPT_KIND,
        receiptId: 'RCPT-STALE-0001',
        jobId: job.id,
        packageId: prev.packageId,
        targetId: prev.targetId,
        scopeSig: prev.scopeSig,
        issuedBy: '接手端 · 旧配置（模拟）',
        issuedAt: iso(this.now() - 12 * 60 * 1000),
        note: '换目标之前那份回执：目标与包编号都对不上当前配置。'
      };
    }

    return {
      kind: RECEIPT_KIND,
      receiptId: `RCPT-${job.id.replace(/[^A-Z0-9]/gi, '')}-01`,
      jobId: job.id,
      packageId: m.package.id,
      targetId: m.targetId,
      scopeSig: this.scopeSig(m),
      issuedBy: '接手端 · 本地模拟',
      issuedAt: iso(this.now()),
      note: '与当前配置匹配的模拟回执，仅用于推进本地演示作业。'
    };
  }

  // ---------- 给界面的视图 ----------
  view() {
    const jobs = {};
    for (const job of Object.values(this.state.jobs)) {
      const m = job.migration;
      const stage = this.stage(job);
      const meta = STAGE_META[stage];
      const fresh = this.checkFresh(job);
      const last = this.state.log.find((e) => e.jobId === job.id) || null;
      jobs[job.id] = {
        id: job.id,
        stage,
        stageLabel: meta.label,
        stageTone: meta.tone,
        scopeSig: this.scopeSig(m),
        scopeList: this.scopeList(m),
        contextSig: this.contextSig(m),
        checkFresh: fresh,
        promptText: m.package ? this.promptText(job) : null,
        lastEvent: last
          ? {
              at: last.at,
              action: last.action,
              before: last.before,
              after: last.after,
              tone: /失效|未通过/.test(last.action) ? 'warn' : 'neutral'
            }
          : null,
        gates: {
          check: { enabled: true, reason: '' },
          authorize: {
            enabled: m.check && m.check.status === 'passed' && fresh,
            reason: !m.check
              ? '先检查迁移条件'
              : m.check.status !== 'passed'
                ? '检查未通过，不能授权'
                : !fresh
                  ? '配置已变更，检查结论过期'
                  : ''
          },
          prompt: {
            enabled: Boolean(m.authorization) && fresh,
            reason: !m.authorization ? '未授权：授权是独立事件，不在复制里顺带完成' : !fresh ? '检查结论已过期' : ''
          },
          receipt: {
            enabled: Boolean(m.package),
            reason: m.package ? '' : '先生成提示词，拿到接手包编号'
          }
        }
      };
    }

    return {
      ...this.state,
      derived: {
        projects: this.state.projects.map((p) => ({
          id: p.id,
          attention: this.attention(p),
          jobStage: p.jobId && this.job(p.jobId) ? this.stage(this.job(p.jobId)) : null
        })),
        jobs,
        stageMeta: STAGE_META
      }
    };
  }
}

const LABELS = {
  permission: '凭据与权限',
  dependency: '依赖与版本',
  space: '目标空间',
  dataLocation: '数据位置'
};

export { SCHEMA_VERSION, SCOPE_KEYS, SCOPE_LABELS, RECEIPT_KIND };
