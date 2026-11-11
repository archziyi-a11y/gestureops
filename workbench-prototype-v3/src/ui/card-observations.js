import {registerCardObservations} from '../domain/asset-catalog.js';
import {renderReportDetails} from './report-details.js';
import {renderJyqDetails} from './jyq-details.js';
import {renderSupportDetails} from './support-details.js';
import {renderGeoDetails} from './geo-details.js';
import {renderPortraitDetails} from './portrait-details.js';
import {renderInfraDetails} from './infra-details.js';
import {renderApplicationDetails} from './application-details.js';
import {renderDataAssetDetails} from './data-asset-details.js';
let snapshot, pending, lastRead=0;
function paint(){
  for(const card of snapshot?.cards || []){
    for(const node of document.querySelectorAll('[data-asset]')){
      if(node.dataset.asset!==card.id)continue;
      const fact=node.querySelector('.ws-fact, footer span');
      if(fact)fact.textContent=card.fact;
      const context=node.querySelector('.ws-card-context');
      if(context)context.textContent=card.summary || `观测于 ${new Date(card.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} · 北京时间`;
    }
    for(const host of document.querySelectorAll('[data-live-card]')){
      if(host.dataset.liveCard!==card.id)continue;
      if(card.id==='prism'){renderApplicationDetails(host,card);continue;}
      if(card.id==='images' && card.dataAsset){renderDataAssetDetails(host,card);continue;}
      if((card.id==='bots'||card.id==='n8n') && card.infra){renderInfraDetails(host,card);continue;}
      if(card.id==='geo' && card.geo){renderGeoDetails(host,card);continue;}
      if(card.id==='portraits' && card.portrait){renderPortraitDetails(host,card);continue;}
      if((card.id==='connections' && card.balances)||(card.id==='deploy' && card.documents)){renderSupportDetails(host,card);continue;}
      if(card.id==='jyq' && card.jyq){renderJyqDetails(host,card);continue;}
      if(card.id==='reports' && card.report){renderReportDetails(host,card);continue;}
      const title=document.createElement('h2');title.textContent=card.fact;
      const summary=document.createElement('p');summary.textContent=card.summary || '';
      const detail=document.createElement('p');detail.textContent=card.detail;
      const time=document.createElement('small');time.textContent=`读取于 ${new Date(card.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} 北京时间 · ${card.source}`;
      const evidence=document.createElement('details');
      const label=document.createElement('summary');label.textContent='运行依据与记录';
      evidence.append(label,detail,time);
      const sections=(card.sections || []).map(item=>{
        const section=document.createElement('section');section.className='sales-area';
        const heading=document.createElement('h3');heading.textContent=item.title;
        const text=document.createElement('p');text.textContent=item.text;
        section.append(heading,text);return section;
      });
      const alerts=(card.alerts || []).map(message=>{const p=document.createElement('p');p.className='prism-warning';p.textContent=message;return p;});
      host.replaceChildren(title,...alerts,...(sections.length?sections:card.summary?[summary]:[]),evidence);
    }
  }
}
export function cardObservationsMounted(){
  if(!document.querySelector('.ws-shelf, [data-live-card], [data-asset="prism"]'))return;
  paint();
  if(pending || Date.now()-lastRead<60000)return;
  pending=fetch('/api/card-observations').then(r=>{if(!r.ok)throw Error();return r.json();}).then(value=>{
    if(!Array.isArray(value.cards))throw Error();
    snapshot=value;lastRead=Date.now();registerCardObservations(value.cards);paint();
  }).catch(()=>{
    document.querySelectorAll('[data-live-card]').forEach(host=>{host.textContent='本次读取失败，稍后重新打开详情可重试。';});
  }).finally(()=>{pending=null;});
}
