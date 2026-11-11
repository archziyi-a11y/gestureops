import assert from 'node:assert/strict';
import {renderApplicationDetails} from '../src/ui/application-details.js';

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ''; this.className = ''; this.classList = {add: value => { this.className += ` ${value}`; }}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
}
globalThis.document = {createElement: tag => new Node(tag)};
const text = node => [node.textContent, ...node.children.map(text)].join(' ');
const host = new Node('div');
renderApplicationDetails(host, {id:'prism', fact:'已有资料仍可浏览', alerts:['下载受阻'], sections:[{title:'图片采集',text:'没有新增'},{title:'平台阶段',text:'待部署与培训'}], detail:'技术记录', source:'本地', observedAt:'2026-11-11T00:00:00Z'});
assert.match(text(host), /没有新增/);
assert.match(text(host), /下载受阻/);
assert.match(text(host), /不代表生产访问/);
assert.equal(host.children.at(-1).tag, 'details');
assert.equal(host.children.at(-1).open, undefined);
renderApplicationDetails(host, {id:'bridge', status:'unknown', fact:'未找到生产回执', detail:'历史错误 12 条'});
assert.match(text(host), /历史记录/);
assert.match(text(host), /本次观测不可用/);
assert.doesNotMatch(text(host.children[1]), /12/);
renderApplicationDetails(host, {id:'sales'});
assert.match(text(host), /完整可用性尚未取得观测/);
assert.doesNotMatch(text(host), /\b0\b/);
console.log('application details: ok');
