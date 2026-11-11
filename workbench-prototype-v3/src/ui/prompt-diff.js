import {diffArrays,diffChars} from '../../node_modules/diff/libesm/index.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=text=>text.match(/[^\n]*\n|[^\n]+$/g)||[];
let cached;
export function comparePrompts(before,after){
 if(cached?.before===before&&cached?.after===after)return cached;
 const rows=[];let coarse=false;
 const changes=diffArrays(lines(before),lines(after),{timeout:100,maxEditLength:2000});
 const addRow=(left,right)=>{
  const kind=left===right?'same':!left?'add':!right?'remove':'modify';
  let parts=kind==='modify'?diffChars(left,right,{timeout:30,maxEditLength:1000}):null;
  if(kind==='modify'&&!parts){coarse=true;parts=[{value:left,removed:true},{value:right,added:true}];}
  rows.push({left,right,kind,parts});
 };
 if(!changes){coarse=true;addRow(before,after);}
 else for(let i=0;i<changes.length;){
  if(!changes[i].added&&!changes[i].removed){for(const line of changes[i++].value)addRow(line,line);continue;}
  const removed=[],added=[];
  while(i<changes.length&&(changes[i].added||changes[i].removed)){
   (changes[i].removed?removed:added).push(...changes[i++].value);
  }
  for(let j=0;j<Math.max(removed.length,added.length);j++)addRow(removed[j]||'',added[j]||'');
 }
 const counts={add:0,remove:0,modify:0};
 rows.forEach((r,i)=>{r.context=rows[i-1]?.kind!=='same'&&i>0||rows[i+1]?.kind!=='same'&&i<rows.length-1;if(r.kind!=='same')counts[r.kind]++;});
 return cached={before,after,rows,counts,coarse};
}
function cell(row,side){
 const text=side==='left'?row.left:row.right;
 if(!text)return '<span class="prompt-diff-empty" aria-label="此版本无对应内容">—</span>';
 if(row.kind==='same')return esc(text);
 if(row.kind==='modify')return row.parts.filter(p=>side==='left'?!p.added:!p.removed).map(p=>p.added?`<ins>${esc(p.value)}</ins>`:p.removed?`<del>${esc(p.value)}</del>`:esc(p.value)).join('');
 return side==='left'?`<del>${esc(text)}</del>`:`<ins>${esc(text)}</ins>`;
}
export function promptDiffView(snapshot){
 const diff=comparePrompts(String(snapshot.baseline??''),String(snapshot.candidate??''));
 const total=diff.counts.add+diff.counts.remove+diff.counts.modify;
 const summary=total?`新增 ${diff.counts.add} 处 · 删除 ${diff.counts.remove} 处 · 修改 ${diff.counts.modify} 处`:'两版完全一致';
 return `<details class="comparison-sources prompt-diff"><summary>本次系统提示词 · ${summary}</summary>
 <div class="prompt-diff-toolbar"><span>${summary}</span><label><input type="checkbox" data-diff-only ${total?'':'disabled'}>只看差异</label><span data-diff-position aria-live="polite"></span><button type="button" data-diff-step="-1" aria-label="上一处差异" title="上一处差异" ${total?'':'disabled'}>↑</button><button type="button" data-diff-step="1" aria-label="下一处差异" title="下一处差异" ${total?'':'disabled'}>↓</button></div>
 ${diff.coarse?'<p>部分长文本按整段标记差异。</p>':''}
 <div class="prompt-diff-head"><h4>原版</h4><h4>修改版</h4></div>
 <div class="prompt-diff-rows">${diff.rows.map((r,i)=>`<div class="prompt-diff-row" data-diff-kind="${r.kind}" data-diff-context="${r.context}" ${r.kind!=='same'?`data-diff-change="${i}" tabindex="-1"`:''}><div class="prompt-diff-cell" data-side="原版">${r.kind!=='same'?`<small>${r.kind==='add'?'':r.kind==='remove'?'− 删除':'文字修改'}</small>`:''}<div>${cell(r,'left')}</div></div><div class="prompt-diff-cell" data-side="修改版">${r.kind!=='same'?`<small>${r.kind==='remove'?'':r.kind==='add'?'＋ 新增':'文字修改'}</small>`:''}<div>${cell(r,'right')}</div></div></div>`).join('')}</div></details>`;
}
export function handlePromptDiff(event){
 const root=event.target.closest('.prompt-diff');if(!root)return;
 if(event.target.matches('[data-diff-only]')){root.classList.toggle('diff-only',event.target.checked);return;}
 const button=event.target.closest('[data-diff-step]');if(!button)return;
 const changes=[...root.querySelectorAll('[data-diff-change]')];if(!changes.length)return;
 const previous=Number(root.dataset.current??(button.dataset.diffStep==='1'?-1:0));
 const index=(previous+Number(button.dataset.diffStep)+changes.length)%changes.length;
 root.dataset.current=String(index);
 changes.forEach((r,i)=>r.classList.toggle('diff-current',i===index));
 root.querySelector('[data-diff-position]').textContent=`${index+1} / ${changes.length}`;
 changes[index].focus({preventScroll:true});changes[index].scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
