import assert from 'node:assert/strict';
import { renderInfraDetails } from '../src/ui/infra-details.js';

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.classList = { add() {} }; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  closest() { return null; }
}
globalThis.document = { createElement: tag => new Element(tag) };
const host = new Element('div');
renderInfraDetails(host, { id: 'n8n', fact: '容器：运行中 1、读取失败 1；就绪检查读取失败', summary: '不代表业务完成', source: 'Docker', infra: {
  items: [{ businessName: '自动任务平台', name: 'pxkb-n8n', state: 'running', stateLabel: '运行中', raw: 'running' }, { businessName: '自动任务平台网关', name: 'scs-n8n-caddy', state: 'error', stateLabel: '读取失败', error: '读取超时' }],
  readiness: { state: 'error', error: '读取失败' },
} });
const nodes = node => [node, ...node.children.flatMap(nodes)];
const all = nodes(host);
assert.equal(all.filter(n => n.tag === 'button').length, 0);
assert.equal(all.filter(n => n.tag === 'details').length, 3);
assert.ok(all.some(n => n.textContent === 'pxkb-n8n' && n.tag === 'code'));
assert.ok(all.some(n => n.textContent === '读取超时'));
assert.ok(all.some(n => n.textContent === '平台就绪检查'));
console.log('infra-details: PASS (offline DOM substitute)');
