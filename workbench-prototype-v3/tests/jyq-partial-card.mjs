// 卡片必须按采集回执呈现 partial / failed，而不是只看退出码是否非零。
// 全部使用临时目录与注入的 execFile，不读真实调度器、不读真实归档。
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLocalCards } from '../src/domain/local-card-observations.js';
import { maintenanceContext } from '../src/domain/maintenance-context.js';

const root = await mkdtemp(join(tmpdir(), 'jyq-partial-'));
const dataDir = join(root, 'corpus_raw/crm/ifangzhou/jyq');
const manifest = join(dataDir, 'manifest.jsonl');
const receipt = join(dataDir, '_meta/last_result.json');

const taskInfo = (lastTaskResult) => ({
  execFile: async (command, args, options) => {
    assert.equal(command, 'powershell.exe');
    assert.equal(options.windowsHide, true);
    if (args.at(-1).includes('.Triggers'))
      return { stdout: JSON.stringify({ kind: 'MSFT_TaskDailyTrigger', enabled: true, days: 1, start: '2026-11-11T21:00:00+08:00', repeat: null }) };
    return { stdout: JSON.stringify({ state: 'Ready', lastRunTime: '2026-11-10T21:00:01+08:00', nextRunTime: '2026-11-11T21:00:00+08:00', lastTaskResult }) };
  },
});

const writeReceipt = (payload) => writeFile(receipt, JSON.stringify(payload));

try {
  await mkdir(join(dataDir, '_meta'), { recursive: true });
  await writeFile(manifest, [{ asset_type: 'image', path: 'a/img_x.jpg' }].map(JSON.stringify).join('\n'));

  await writeReceipt({
    version: 1,
    status: 'partial',
    exit_code: 2,
    run_id: 'run-partial',
    finished_at: '2026-11-10T21:03:00+08:00',
    counts: { images: 3, image_failed: 2 },
    failed_items: 2,
    failed_by_stage: { network: 2, write: 0, parse: 0 },
    scan_complete: false,
    scan_incomplete_rooms: ['27-速写教研群'],
    pending: 1,
    secret: 'PRIVATE_SENTINEL',
  });

  let result = await readLocalCards({ root, dependencies: taskInfo(2) });
  let jyq = result.cards[0];
  assert.equal(jyq.id, 'jyq');
  assert.equal(jyq.status, 'observed');
  assert.match(jyq.fact, /上次采集部分完成/);
  assert.doesNotMatch(jyq.fact, /上次任务正常结束/);
  assert.match(jyq.issue, /部分完成/);
  assert.match(jyq.issue, /扫描范围未完成（27-速写教研群）/);
  assert.match(jyq.issue, /2 项未完成（network 2）/);
  assert.match(jyq.detail, /待补 1 项/);
  assert.match(jyq.detail, /扫描未完成/);
  assert.match(jyq.detail, /last_result\.json/);
  // 回执里的多余字段不得出现在卡片输出里
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SENTINEL/);

  // 扫描完成、仍有待补项：必须说明是待补，而不是扫描问题
  await writeReceipt({
    status: 'partial', exit_code: 2, run_id: 'run-partial-2', finished_at: '2026-11-10T21:05:00+08:00',
    counts: { images: 5, image_failed: 1 }, failed_items: 1,
    failed_by_stage: { network: 1, write: 0, parse: 0 }, scan_complete: true,
    scan_incomplete_rooms: [], pending: 1,
  });
  result = await readLocalCards({ root, dependencies: taskInfo(2) });
  jyq = result.cards[0];
  assert.match(jyq.fact, /上次采集部分完成/);
  assert.doesNotMatch(jyq.issue, /扫描范围未完成/);
  assert.match(jyq.issue, /1 项未完成/);
  assert.match(jyq.detail, /扫描完成/);

  // failed：与 partial 用不同措辞
  await writeReceipt({
    status: 'failed', exit_code: 1, run_id: 'run-failed', finished_at: '2026-11-10T21:07:00+08:00',
    counts: { images: 0 }, failed_items: 0, failed_by_stage: {},
    scan_complete: false, scan_incomplete_rooms: [], pending: 0,
  });
  result = await readLocalCards({ root, dependencies: taskInfo(1) });
  jyq = result.cards[0];
  assert.match(jyq.fact, /上次采集失败/);
  assert.match(jyq.issue, /采集失败/);
  assert.match(jyq.detail, /扫描未完成/);

  // success：不产生 issue，旧调度器口径里的“非零”不覆盖回执结论
  await writeReceipt({
    status: 'success', exit_code: 0, run_id: 'run-ok', finished_at: '2026-11-10T21:09:00+08:00',
    counts: { images: 4 }, failed_items: 0, failed_by_stage: {}, scan_complete: true,
    scan_incomplete_rooms: [], pending: 0,
  });
  result = await readLocalCards({ root, dependencies: taskInfo(0) });
  jyq = result.cards[0];
  assert.match(jyq.fact, /上次采集完成/);
  assert.equal(jyq.issue, undefined);

  // 单群成功：不能把四群卡片整体变正常，其他群的欠账要继续显示
  await writeReceipt({
    version: 2, status: 'success', exit_code: 0, run_id: 'run-room-ok',
    finished_at: '2026-11-11T15:30:00+08:00',
    scope: 'room', rooms: ['27-速写教研群'], scope_rooms: 1, whitelist_rooms: 4,
    counts: { images: 2, assets_new: 2 }, failed_items: 0, failed_by_stage: {},
    scan_complete: true, scan_incomplete_rooms: [],
    pending: 3, pending_in_scope: 0, pending_out_of_scope: 3,
    requested_since: '2026-11-10', since: '2026-11-10', since_ms: 1, until_ms: 2,
    window: '2026-11-10T00:00:00+08:00..2026-11-11T15:30:00+08:00',
    window_from_pending: false, resume_reason: {},
  });
  result = await readLocalCards({ root, dependencies: taskInfo(2) });
  jyq = result.cards[0];
  assert.match(jyq.fact, /另一次单群补采完成（27-速写教研群 · 2026-11-11T15:30\+08:00）/);
  // 四群定时任务的口径仍在，单群结果另列
  assert.match(jyq.fact, /上次返回 2/);
  assert.match(jyq.issue, /单群补采完成，其他群仍有 3 项待补/);
  assert.match(jyq.detail, /四群定时任务的结果仍以调度器口径与上一份日跑回执为准/);
  assert.match(jyq.detail, /仅覆盖 1\/4 群，不代表四群定时采集结果/);
  assert.match(jyq.detail, /实际读取窗口 2026-11-10T00:00:00\+08:00/);

  // 单群成功且无其他群欠账：不报警，但仍要写明范围
  await writeReceipt({
    version: 2, status: 'success', exit_code: 0, run_id: 'run-room-clean',
    finished_at: '2026-11-11T15:35:00+08:00',
    scope: 'room', rooms: ['27-速写教研群'], scope_rooms: 1, whitelist_rooms: 4,
    counts: { images: 1 }, failed_items: 0, failed_by_stage: {},
    scan_complete: true, scan_incomplete_rooms: [],
    pending: 0, pending_in_scope: 0, pending_out_of_scope: 0,
    window: '2026-11-10T00:00:00+08:00..2026-11-11T15:35:00+08:00', window_from_pending: false,
  });
  result = await readLocalCards({ root, dependencies: taskInfo(0) });
  jyq = result.cards[0];
  assert.equal(jyq.issue, undefined);
  assert.match(jyq.detail, /不代表四群定时采集结果/);
  assert.match(jyq.fact, /另一次单群补采完成/);
  assert.match(jyq.fact, /上次任务正常结束|上次返回/);

  // 四群回执前推窗口：必须把实际窗口与前推原因写进 detail
  await writeReceipt({
    version: 2, status: 'partial', exit_code: 2, run_id: 'run-all-pushed',
    finished_at: '2026-11-11T15:40:00+08:00',
    scope: 'all-whitelist', rooms: ['26-校长群', '27-素描教研群', '27-色彩教研群', '27-速写教研群'],
    scope_rooms: 4, whitelist_rooms: 4,
    counts: { images: 2 }, failed_items: 1, failed_by_stage: { network: 1, write: 0, parse: 0 },
    scan_complete: true, scan_incomplete_rooms: [],
    pending: 2, pending_in_scope: 2, pending_out_of_scope: 0,
    window: '2026-11-07T10:00:00+08:00..2026-11-11T15:40:00+08:00',
    window_from_pending: true,
    resume_reason: { earliest_ms: 1, earliest_local: '2026-11-07T10:00:00+08:00', items: 1, windows: 0, rooms: ['27-速写教研群'], reason: '待补项最早位于 2026-11-07T10:00:00+08:00（27-速写教研群），窗口已前推至该时间' },
  });
  result = await readLocalCards({ root, dependencies: taskInfo(2) });
  jyq = result.cards[0];
  assert.match(jyq.fact, /上次采集部分完成/);
  assert.match(jyq.detail, /因待补项前推/);
  assert.match(jyq.detail, /2026-11-07T10:00:00\+08:00/);
  assert.match(jyq.detail, /白名单全部群/);

  // 回执缺失：退回调度器口径，仍把非零标为待核对，不当作正常
  await unlink(receipt);
  result = await readLocalCards({ root, dependencies: taskInfo(2) });
  jyq = result.cards[0];
  assert.match(jyq.fact, /上次返回 2/);
  assert.doesNotMatch(jyq.fact, /上次采集/);
  assert.match(jyq.issue, /最近任务结果码非零/);

  // 回执损坏：同样退回旧口径，不乱猜状态
  await writeFile(receipt, '{not json');
  result = await readLocalCards({ root, dependencies: taskInfo(2) });
  assert.match(result.cards[0].issue, /最近任务结果码非零/);

  // 处理上下文必须带上新状态、入口与"根因未查明"的边界
  const ctx = maintenanceContext({ id: 'jyq' });
  assert.match(ctx, /success\/partial\/failed/);
  assert.match(ctx, /0\/2\/1/);
  assert.match(ctx, /last_result\.json/);
  assert.match(ctx, /collection_pending\.json/);
  assert.match(ctx, /根因未解决|尚未查明/);
  assert.match(ctx, /资产路径/);
  // 范围与窗口的口径必须进处理上下文，否则下一轮又会把单群当四群
  assert.match(ctx, /scope=room/);
  assert.match(ctx, /pending_in_scope/);
  assert.match(ctx, /requested_since/);
  assert.match(ctx, /window_from_pending/);
  assert.match(ctx, /assets_new/);

  console.log('jyq-partial-card: passed (isolated fixtures, no live reads)');
} finally {
  await rm(root, { recursive: true, force: true });
}
