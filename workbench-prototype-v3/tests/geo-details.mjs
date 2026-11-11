import assert from 'node:assert/strict';
import {renderGeoDetails} from '../src/ui/geo-details.js';
class Node {constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.classList={add(){}};} append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}}
globalThis.document={createElement:tag=>new Node(tag)};
const host=new Node('main');
renderGeoDetails(host,{fact:'运行待核对',geo:{task:{result:0},batch:{dryRun:false},gates:{passed:0,total:2},outputs:{nonEmpty:null,total:2},currentReceipt:false}});
const all=node=>[node,...node.children.flatMap(all)];
const nodes=all(host), text=nodes.map(n=>n.textContent).join(' ');
assert.match(text,/历史回执，不能代表本次运行/);
assert.match(text,/0 \/ 2/);assert.match(text,/未知/);assert.match(text,/非试运行/);
assert.match(text,/不代表已发布/);assert.equal(nodes.filter(n=>n.tag==='button').length,0);
assert.equal(nodes.filter(n=>n.tag==='details').length,1);
renderGeoDetails(host,{});assert.match(all(host).map(n=>n.textContent).join(' '),/未知/);
console.log('PASS GEO details: unknown, historical receipt, zero, evidence and no buttons');
