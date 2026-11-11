import assert from 'node:assert/strict';
import {projectSalesSources, readSupportCards} from '../src/domain/support-card-observations.js';
import {renderDataAssetDetails} from '../src/ui/data-asset-details.js';

assert.deepEqual(projectSalesSources(null), {total:null,pending:null,updatedAt:null});
assert.deepEqual(projectSalesSources({total:0,pending:-1,updatedAt:'bad',sources:[{note:'secret'}]}), {total:0,pending:null,updatedAt:null});
const cards = await readSupportCards({root:'unused',inspect:async()=>{throw Error('missing');},sourceSnapshot:{total:2,pending:0,updatedAt:'2026-11-11T01:00:00Z'}});
const card = cards.cards.find(c=>c.id==='sales-sources');
assert.equal(card.dataAsset.total,2);
const host = {};
assert.equal(renderDataAssetDetails(host,card),true);
assert.match(host.innerHTML,/待整理<\/dt><dd>0 份/);
assert.match(host.innerHTML,/未验证实际业务消费/);
renderDataAssetDetails(host,{id:'images',status:'unknown',source:'<script>'});
assert.match(host.innerHTML,/未知 条/);
assert.match(host.innerHTML,/&lt;script&gt;/);
assert.doesNotMatch(host.innerHTML,/<script>/);
assert.equal(renderDataAssetDetails(host,{id:'jyq'}),false);
console.log('data asset details passed');
