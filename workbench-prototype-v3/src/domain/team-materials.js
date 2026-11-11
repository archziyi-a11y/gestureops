import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

export function createTeamMaterials({ root, dir, run }) {
  const memory = new Map();
  run ??= command => new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON || 'python', ['-X', 'utf8', path.join(root, 'scripts/team-materials.py')], { windowsHide: true });
    let output = '';
    let bytes = 0, failure;
    const stop = message => { failure ??= Error(message); child.kill(); };
    const timer = setTimeout(() => stop('materials_transport_timeout'), 45000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { bytes += Buffer.byteLength(chunk); if (bytes > 40 * 1024 * 1024) stop('materials_output_limit'); else output += chunk; });
    child.stderr.on('data', chunk => { bytes += chunk.length; if (bytes > 40 * 1024 * 1024) stop('materials_output_limit'); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      try { if (failure) throw failure; if (code) throw Error('materials_transport_failed'); resolve(JSON.parse(output)); } catch (error) { reject(error); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(command));
  });
  async function read() {
    const materials = []; let offset = 0, revision;
    for (let page = 0; page < 26; page++) {
      const result = await run({ op: 'read', offset });
      if (!Array.isArray(result.materials) || typeof result.revision !== 'string') throw Error('invalid_snapshot');
      revision ??= result.revision;
      if (revision !== result.revision) throw Error('materials_revision_changed');
      materials.push(...result.materials);
      if (result.next_offset === null) return { materials, revision };
      if (!Number.isInteger(result.next_offset) || result.next_offset <= offset || result.next_offset > 5000) throw Error('invalid_pagination');
      offset = result.next_offset;
    }
    throw Error('incomplete_snapshot');
  }
  async function upload(input) {
    const { requestId, title, content, base64 } = input;
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId ?? '') || typeof title !== 'string' || !title.trim() || title.length > 120) throw Error('invalid_material');
    if ((content !== undefined) === (base64 !== undefined)) throw Error('invalid_material');
    if (content !== undefined && (typeof content !== 'string' || !content.trim() || content.length > 16000)) throw Error('invalid_content');
    if (base64 !== undefined && (typeof base64 !== 'string' || !base64 || base64.length > 11184812 || Buffer.from(base64, 'base64').length > 8 * 1024 * 1024 || Buffer.from(base64, 'base64').toString('base64') !== base64)) throw Error('image_limit_8mb');
    const payload = { requestId, title, ...(base64 === undefined ? { content } : { base64 }) };
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, requestId + '.json');
    const previous = memory.get(requestId) ?? await readFile(file, 'utf8').then(JSON.parse).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (previous) {
      if (previous.payloadHash !== payloadHash) throw Error('request_payload_conflict');
      return previous.status === 'pending' ? { ...previous, status: 'unknown' } : previous;
    }
    const receipt = { requestId, payloadHash, status: 'pending' };
    try { await writeFile(file, JSON.stringify(receipt), { flag: 'wx' }); }
    catch (e) { if (e.code === 'EEXIST') return upload(input); throw e; }
    memory.set(requestId, receipt);
    try {
      const material = await run({ op: 'upload', payload });
      if (material?.status === 'knownfailure' && Number.isInteger(material.httpStatus) && material.httpStatus >= 400 && material.httpStatus < 500) {
        receipt.status = 'knownfailure'; receipt.httpStatus = material.httpStatus;
      } else {
      if (!material?.id || !material?.type) throw Error('invalid_upload_response');
      receipt.status = 'knownsuccess'; receipt.material = material;
      }
    } catch { receipt.status = 'unknown'; }
    try {
      await writeFile(file + '.tmp', JSON.stringify(receipt));
      await rename(file + '.tmp', file);
    } catch { receipt.receiptPersistenceFailed = true; }
    return { ...receipt };
  }
  async function image(id) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw Error('invalid_material_id');
    const result = await run({ op: 'image', id });
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(result.mime) || typeof result.base64 !== 'string') throw Error('invalid_image');
    return result;
  }
  async function capabilities() {
    try { return await run({op:'capabilities'}); }
    catch { return {can_delete:false,message:'销售助手管理连接读取失败'}; }
  }
  async function remove({id,title}) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id??'') || typeof title!=='string' || !title || title.length>120) throw Error('invalid_material');
    let result;
    try { result=await run({op:'delete',id,title}); }
    catch { return {status:'unknown'}; }
    if(result?.status==='knownfailure')return result;
    if(result?.id!==id || result.deleted!==true)return {status:'unknown'};
    // A later list-refresh failure must not erase the confirmed deletion receipt.
    return {status:'knownsuccess',id,deleted:true};
  }
  return { read, upload, image, capabilities, remove };
}
