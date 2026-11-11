export function createMigrationViews({
  STATE,
  draftReceipt,
  page,
  inlineNote,
  esc,
  chip,
  fmtTime,
  ICONS,
}) {
  function viewMigrate(projectId) {
    migrationStyle();
    const p = STATE.projects.find((x) => x.id === projectId);
    if (!p) return page(`<div class="empty">项目不存在。</div>`);
    const job = p.jobId ? STATE.jobs[p.jobId] : null;
    if (!job) return page(`<div class="empty">这个项目没有迁移作业。</div>`);

    const m = job.migration;
    const jd = STATE.derived.jobs[job.id];
    const gates = jd.gates;
    const target = STATE.targets.find((t) => t.id === m.targetId);
    const credential = STATE.credentials.find(
      (c) => c.id === m.credentialRefId,
    );

    const targetRows = STATE.targets
      .map(
        (t) => `
      <label class="opt${m.targetId === t.id ? " is-on" : ""}" data-call="set_target" data-job="${esc(job.id)}" data-target="${esc(t.id)}">
        <input type="radio" name="target" ${m.targetId === t.id ? "checked" : ""} />
        <span class="opt__body">
          <span class="opt__title">${esc(t.name)}${t.retired ? ' <span class="mono dim small">已下线</span>' : ""}</span>
          <span class="mono dim small">${esc(t.endpoint)}</span>
        </span>
        <span class="opt__note mono dim small">${esc(t.note)}</span>
      </label>`,
      )
      .join("");

    const credRows = STATE.credentials
      .map(
        (c) => `
      <label class="opt${m.credentialRefId === c.id ? " is-on" : ""}" data-call="set_credential" data-job="${esc(job.id)}" data-ref-id="${esc(c.id)}">
        <input type="radio" name="cred" ${m.credentialRefId === c.id ? "checked" : ""} />
        <span class="opt__body">
          <span class="opt__title mono">${esc(c.label)}</span>
          <span class="mono dim small">${esc(c.note)}</span>
        </span>
        <span class="opt__note mono dim small">仅引用</span>
      </label>`,
      )
      .join("");

    const scopeCells = ["code", "config", "db", "materials"]
      .map((k) => {
        const label = {
          code: "代码",
          config: "配置",
          db: "数据库",
          materials: "团队物料",
        }[k];
        const on = m.scope[k];
        return `
        <label class="check${on ? " is-on" : ""}" data-call="toggle_scope" data-job="${esc(job.id)}" data-key="${k}">
          <input type="checkbox" ${on ? "checked" : ""} />
          <span class="check__box">${on ? ICONS.ok : ""}</span>
          <span>${label}</span>
        </label>`;
      })
      .join("");

    const checkItems = m.check
      ? m.check.items
          .map(
            (i) => `
        <li class="checkrow">
          ${chip(
            i.state === "ok"
              ? "通过"
              : i.state === "failed"
                ? "失败"
                : "未检查",
            i.state === "ok"
              ? "ok"
              : i.state === "failed"
                ? "danger"
                : "unknown",
          )}
          <span class="checkrow__label">${esc(i.label)}</span>
          <span class="checkrow__detail sub small">${esc(i.detail)}</span>
        </li>`,
          )
          .join("")
      : '<li class="empty">还没检查。这一步只读，不复制任何数据。</li>';

    const lastEvent = jd.lastEvent;

    // 三个动作始终在，只有下一个该做的是实心；不能做的就灰着，并在下面写清为什么。
    const nextPrimary =
      jd.stage === "checked"
        ? "authorize"
        : jd.stage === "authorized"
          ? "build_prompt"
          : jd.stage === "awaiting_handoff" || jd.stage === "ready"
            ? "handoff"
            : "run_check";
    const variantFor = (a) => (nextPrimary === a ? "primary" : "ghost");
    const hintText =
      nextPrimary === "run_check"
        ? "先检查迁移条件：这一步只读，不复制任何数据。"
        : nextPrimary === "authorize"
          ? gates.authorize.reason ||
            "检查已通过。下一步是授权，授权会绑定当前目标与范围。"
          : nextPrimary === "build_prompt"
            ? gates.prompt.reason ||
              "已授权。下一步生成提示词；复制不等于派发。"
            : "交接内容已生成；匹配回执到达前仍为待接手。";

    return page(`
    ${inlineNote()}
    <nav class="crumbs mono"><a href="#/">工作台</a><span>/</span><a href="#/p/${p.id}">${esc(p.name)}</a><span>/</span><span>部署与迁移</span></nav>

    <section class="pagehead">
      <div>
        <p class="eyebrow mono">MIGRATION · 迁移准备</p>
        <h1 class="h2">准备一次隔离迁移</h1>
        <p class="sub">${esc(job.id)} · ${esc(job.title)} · 检查只读，授权是一次独立事件。</p>
      </div>
      ${chip(jd.stageLabel, jd.stageTone)}
    </section>

    <div class="migration-draft" aria-live="polite">
      <strong>${m.package ? (m.receipt ? "已接手（模拟）" : "待接手") : "交接草稿 · 未签发"}</strong>
      <p>目标：${esc(target?.name || "未选")} · 凭据：${esc(credential?.label || "未选")} · 范围：${esc(jd.scopeList.join("、") || "未选")}</p>
      ${m.lastInvalidatedAuthorization && !m.authorization ? `<p>原授权对应 ${esc(STATE.targets.find((t) => t.id === m.lastInvalidatedAuthorization.targetId)?.name || m.lastInvalidatedAuthorization.targetId)}，已失效。当前配置未获授权。</p>` : ""}
    </div>

    ${
      lastEvent
        ? `<div class="notice notice--${lastEvent.tone}">
             <span class="mono">最近变化 ${fmtTime(lastEvent.at)}</span>
             <span>${esc(lastEvent.action)}：${esc(lastEvent.before)} → ${esc(lastEvent.after)}</span>
           </div>`
        : ""
    }

    <section class="cols">
      <div class="stack">
        <article class="card">
          <header class="card__head">
            <h2 class="h3">目标隔离环境</h2>
            ${chip(target?.retired ? "已下线" : m.check && jd.checkFresh ? "见检查结果" : "未检查", target?.retired ? "warn" : "neutral")}
          </header>
          <div class="opts">${targetRows}</div>
          ${m.previous && !m.authorization ? `<p class="notice">原交接包对应目标 ${esc(STATE.targets.find((t) => t.id === m.previous.targetId)?.name || m.previous.targetId)}；当前目标 ${esc(target?.name || "未选")}${m.check && jd.checkFresh ? "已检查，尚未授权" : "尚未检查"}。旧回执不证明当前配置成功。<a href="#/records">查看历史记录</a></p>` : ""}
          <p class="sub small">选哪个都能选；换掉就等于换了这次作业的对象，之前的检查与授权会一起作废。</p>
        </article>

        <article class="card">
          <header class="card__head">
            <h2 class="h3">本地凭据引用</h2>
            ${chip("仅引用", "neutral")}
          </header>
          <div class="opts">${credRows}</div>
          <p class="sub small">只记录引用标识，不读取、不显示任何密钥内容。</p>
        </article>

        <article class="card">
          <header class="card__head">
            <h2 class="h3">本次范围</h2>
            <span class="mono dim small">${jd.scopeList.length} / 4 已选</span>
          </header>
          <div class="checks">${scopeCells}</div>
          <p class="sub small">改范围会作废旧检查：范围是授权的一部分。</p>
        </article>

        <article class="card">
          <header class="card__head">
            <h2 class="h3">检查结果</h2>
            ${
              m.check
                ? chip(
                    m.check.status === "passed" ? "5 / 5 通过" : "受阻",
                    m.check.status === "passed" ? "ok" : "danger",
                  )
                : chip("未检查", "neutral")
            }
          </header>
          <ul class="checklist">${checkItems}</ul>
          <p class="mono dim small">${m.check ? `检查时间 ${fmtTime(m.check.at)} · 检查器 check-migration@0.4（模拟）` : "还没有检查记录"}</p>
        </article>

        <div class="actions actionbar">
          ${!m.authorization ? actBtn("run_check", job.id, `检查${esc(target?.name || "目标")}`, gates.check, variantFor("run_check")) : ""}
          ${gates.authorize.enabled && !m.authorization ? `<p>授权目标：${esc(target?.name || "未选")}；范围：${esc(jd.scopeList.join("、") || "未选")}。源只读，不写生产。</p>${actBtn("authorize", job.id, "授权本次作业", gates.authorize, "primary")}` : ""}
          ${m.authorization && !m.package ? actBtn("build_prompt", job.id, "生成并复制交接内容", gates.prompt, "primary") : ""}
          ${!m.package ? `<p class="hint">${esc(hintText)}</p>` : ""}
        </div>
      </div>

      <div class="stack">
    <section class="migration-draft" id="migration-handoff" aria-label="交接内容">
      ${m.package ? viewHandoff(projectId, true) : `<details open><summary>交接草稿 · 未签发 · ${m.authorization ? "已授权" : "尚未授权"}</summary><dl class="kv"><div><dt>目标</dt><dd>${esc(target?.name || "未选")}</dd></div><div><dt>凭据引用</dt><dd>${esc(credential?.label || "未选")}</dd></div><div><dt>范围</dt><dd>${esc(jd.scopeList.join("、") || "未选")}</dd></div><div><dt>边界</dt><dd>源只读 · 单次 · 不写生产</dd></div></dl></details>`}
    </section>

        <details class="card">
          <summary>调试入口 · 模拟条件</summary>
          <header class="card__head">
            <h2 class="h3">模拟条件</h2>
            <span class="mono dim small">改了就会作废旧检查</span>
          </header>
          <div class="switchrow">
            <span>目标可达</span>
            <span class="seg">
              <button class="seg__btn${STATE.conditions.targetReachable === "reachable" ? " is-on" : ""}" data-call="set_condition" data-key="targetReachable" data-value="reachable">可达</button>
              <button class="seg__btn${STATE.conditions.targetReachable === "unreachable" ? " is-on" : ""}" data-call="set_condition" data-key="targetReachable" data-value="unreachable">不可达</button>
            </span>
          </div>
          <div class="switchrow">
            <span>凭据可用</span>
            <span class="seg">
              <button class="seg__btn${STATE.conditions.credentialState === "valid" ? " is-on" : ""}" data-call="set_condition" data-key="credentialState" data-value="valid">可用</button>
              <button class="seg__btn${STATE.conditions.credentialState === "rejected" ? " is-on" : ""}" data-call="set_condition" data-key="credentialState" data-value="rejected">被拒绝</button>
            </span>
          </div>
          <p class="sub small">这两项只影响本地模拟检查的结果，用来验证「检查不通过就不能授权」。</p>
        </details>

      </div>
    </section>
  `);
  }

  function actBtn(action, jobId, label, gate, variant = "ghost") {
    const disabled = !gate.enabled;
    const cls = variant === "primary" ? "btn--primary" : "btn--ghost";
    return `<button class="btn ${cls}" ${
      disabled ? "disabled" : ""
    } data-call="${action}" data-job="${esc(jobId)}" title="${esc(gate.reason || "")}">${label}</button>`;
  }

  // ---------- 交接 ----------
  function migrationStyle() {
    if (!document.getElementById("migration-style")) {
      const style = document.createElement("link");
      style.id = "migration-style";
      style.rel = "stylesheet";
      style.href = new URL("./migration.css", import.meta.url).href;
      document.head.appendChild(style);
    }
  }

  function viewHandoff(projectId, embedded = false) {
    migrationStyle();
    const p = STATE.projects.find((x) => x.id === projectId);
    if (!p) return page(`<div class="empty">项目不存在。</div>`);
    const job = p.jobId ? STATE.jobs[p.jobId] : null;
    if (!job) return page(`<div class="empty">这个项目没有迁移作业。</div>`);
    const m = job.migration;
    const jd = STATE.derived.jobs[job.id];
    const target = STATE.targets.find((t) => t.id === m.targetId);

    if (!m.package) {
      return page(`
      ${inlineNote()}
      <nav class="crumbs mono"><a href="#/">工作台</a><span>/</span><a href="#/p/${p.id}">${esc(p.name)}</a><span>/</span><span>交接</span></nav>
      <section class="pagehead">
        <div>
          <p class="eyebrow mono">HANDOFF · 智能体交接</p>
          <h1 class="h2">还没有可交接的提示词</h1>
          <p class="sub">提示词要按当前配置生成：换过目标或范围，就得重新生成一次。</p>
        </div>
        ${chip(jd.stageLabel, jd.stageTone)}
      </section>
      <div class="actions">
        <a class="btn btn--primary" href="#/p/${p.id}/migrate-demo">回到迁移演练</a>
      </div>
    `);
    }

    const content = `
    ${inlineNote()}
    <nav class="crumbs mono"><a href="#/">工作台</a><span>/</span><a href="#/p/${p.id}">${esc(p.name)}</a><span>/</span><span>交接</span></nav>

    <section class="pagehead">
      <div>
        <p class="eyebrow mono">HANDOFF · 智能体交接</p>
        <h1 class="h2">${m.receipt ? "已接手（模拟）" : "待接手"}</h1>
        <p class="sub">同一份结构化上下文，生成一段能直接粘的提示词。复制不是派发，更不是执行。</p>
      </div>
      ${chip(jd.stageLabel, jd.stageTone)}
    </section>

    <section class="cols">
      <div class="stack">
        <article class="card">
          <header class="card__head">
            <h2 class="h3">交接上下文</h2>
            <span class="mono dim small">不随文字改动</span>
          </header>
          <dl class="kv kv--wide">
            <div><dt>项目索引</dt><dd class="mono">${esc(p.indexRef)}</dd></div>
            <div><dt>作业编号</dt><dd class="mono">${esc(job.id)} · 单次</dd></div>
            <div><dt>目标</dt><dd>${esc(target.name)}</dd></div>
            <div><dt>凭据引用</dt><dd class="mono">${esc(m.credentialRefId)}（仅引用）</dd></div>
            <div><dt>范围</dt><dd>${esc(jd.scopeList.join("、"))}</dd></div>
            <div><dt>授权边界</dt><dd>源只读 · 单次 · 不改调度 · 不写生产</dd></div>
            <div><dt>接手包</dt><dd class="mono">${esc(m.package.id)}</dd></div>
            <div><dt>回执要求</dt><dd>匹配作业与包编号；不匹配不推进</dd></div>
          </dl>
        </article>

        <article class="card">
          <header class="card__head">
            <h2 class="h3">提示词</h2>
            <button class="btn btn--ghost btn--sm" data-call="copy_prompt" data-job="${esc(job.id)}">${ICONS.copy} 再复制一次</button>
          </header>
          <pre class="prompt" id="prompt" tabindex="0">${esc(jd.promptText || "")}</pre>
          <p class="sub small">这段文字是本地生成的；复制只到你的剪贴板，没有发往任何服务。</p>
        </article>

        <article class="card">
          <header class="card__head">
            <h2 class="h3">导入接手回执</h2>
            ${m.receipt ? chip("已收到", "ok") : chip("未收到", "warn")}
          </header>
          <p class="sub small">必须匹配作业编号、包编号、目标和范围签名；不匹配会被拒绝，不推进作业。</p>
          <textarea class="textarea" id="receipt" rows="7" placeholder='{ "kind": "workbench.handoff.receipt", ... }'>${esc(draftReceipt)}</textarea>
          <div class="samples">
            <button class="btn btn--ghost btn--sm" data-sample="matched">载入匹配示例</button>
            <button class="btn btn--ghost btn--sm" data-sample="wrong-job">载入错配示例（其它作业）</button>
            ${m.previous ? `<button class="btn btn--ghost btn--sm" data-sample="stale">载入换目标前的旧回执</button>` : ""}
          </div>
          <div class="actions actions--inline">
            <button class="btn btn--primary" data-call="import_receipt" data-job="${esc(job.id)}" data-source="receipt">导入回执</button>
            <span class="hint">导入后会真的走一遍校验；不通过就还是待接手。</span>
          </div>
        </article>
      </div>

      <div class="stack">
        <article class="card">
          <header class="card__head">
            <h2 class="h3">授权与接手</h2>
            <span class="mono dim small">两个独立事件</span>
          </header>
          <dl class="kv">
            <div><dt>授权</dt><dd>${m.authorization ? `已授权 ${fmtTime(m.authorization.at)}` : "未授权"}</dd></div>
            <div><dt>绑定范围</dt><dd>${esc(jd.scopeSig)}</dd></div>
            <div><dt>提示词</dt><dd class="mono">${esc(m.package.id)} · ${fmtTime(m.package.at)}</dd></div>
            <div><dt>接手回执</dt><dd>${m.receipt ? `${esc(m.receipt.receiptId)} · ${fmtTime(m.receipt.at)}` : "未收到"}</dd></div>
          </dl>
          <p class="sub small">授权不等于执行；生成提示词也不等于派发；只有匹配的回执才会推进作业。</p>
        </article>

        ${
          m.receiptsRejected && m.receiptsRejected.length
            ? `<article class="card">
                 <header class="card__head"><h2 class="h3">被拦下的回执</h2><span class="mono dim small">${m.receiptsRejected.length} 次</span></header>
                 <ul class="bullets">${m.receiptsRejected
                   .slice(0, 4)
                   .map(
                     (r) =>
                       `<li><span class="mono dim small">${fmtTime(r.at)}</span> ${esc(r.reason)}</li>`,
                   )
                   .join("")}</ul>
               </article>`
            : ""
        }

        <article class="card">
          <header class="card__head"><h2 class="h3">这一步没有做什么</h2></header>
          <ul class="bullets">
            <li>没有启动真实 WorkBuddy，也没有派发任何任务。</li>
            <li>没有复制、上传或写入任何密钥。</li>
            <li>没有连接生产环境，没有执行真实迁移。</li>
          </ul>
          <a class="linkbtn" href="#/records">看作业记录 ${ICONS.arrow}</a>
        </article>
      </div>
    </section>
  `;
    return embedded ? content : page(content);
  }

  return { viewMigrate, viewHandoff };
}
