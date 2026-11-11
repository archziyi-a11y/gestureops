import {stat} from 'node:fs/promises';
import {join} from 'node:path';

const documents=[
  'project/modules/qm-sales-assistant/deploy/README.md',
  'project/modules/qm-sales-assistant/docs/SERVER-MIGRATION-DEPLOYMENT-SOP.md',
  'docs/SALES-ISOLATED-MIGRATION-AGENT-HANDOFF.md',
];
export async function readSupportCards({root,balance={},inspect=stat,now=()=>new Date(),sourceSnapshot=null}){
  const rows=[];
  for(const file of documents){try{rows.push({file,exists:(await inspect(join(root,file))).isFile()});}catch{rows.push({file,exists:false});}}
  const balances=['sales','knowledge','dock'].map(id=>{
    const row=balance.connections?.[id], value=row?.balances?.find(b=>b.currency==='CNY');
    const valid=value && String(value.total).trim()!=='' && Number.isFinite(Number(value.total));
    const time=typeof row?.checkedAt==='string' && Number.isFinite(Date.parse(row.checkedAt)) ? row.checkedAt : null;
    return {id,name:{sales:'销售业务',knowledge:'知识试问',dock:'对接表主模型'}[id],text:valid?`¥${Number(value.total).toFixed(2)}`:'尚无余额记录',amount:valid?Number(value.total):null,currency:'CNY',low:!!valid&&Number(value.total)<(balance.threshold??5),error:!!row?.error,time};
  });
  return {observedAt:now().toISOString(),cards:[
    {id:'connections',fact:balances.map(b=>`${b.name} ${b.text}${b.error?'（更新失败）':b.low?'（余额偏低）':''}`).join(' · '),
      balances,detail:balances.map(b=>`${b.name}：${b.time?`余额查询时间 ${b.time}`:'尚未成功查询'}${b.error&&b.amount!==null?'；保留上次余额':b.error?'；本次查询失败':''}`).join('；')+'。来自定时缓存，不代表飞书或方舟连接状态。',source:'本地定时余额缓存 / balance-monitor',status:balances.some(b=>b.error||!b.time||b.amount===null)?'partial':'observed',
      ...(balances.some(b=>b.low||b.error)?{issue:'模型余额偏低或更新失败',severity:'normal'}:{})},
    {id:'deploy',documents:rows,fact:rows.every(r=>r.exists)?'可准备销售助手部署与迁移':'迁移准备缺少接手资料',summary:'填写目标环境后可组装接手任务；执行前检查目标连接与恢复资源。',detail:rows.map(r=>`${r.file}：${r.exists?'存在':'未取得'}`).join('；')+'。只检查文件存在性，目标环境由迁移任务核对。',source:'本地部署、迁移 SOP 与接手文档',status:rows.every(r=>r.exists)?'observed':'partial'},
    ...(sourceSnapshot?[{id:'sales-sources',fact:'源文件统计已读取',status:'observed',source:'销售知识资料快照',dataAsset:projectSalesSources(sourceSnapshot)}]:[]),
  ]};
}

export function projectSalesSources(snapshot){
  const count=n=>Number.isSafeInteger(n)&&n>=0?n:null;
  const time=typeof snapshot?.updatedAt==='string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot.updatedAt) && Number.isFinite(Date.parse(snapshot.updatedAt))?snapshot.updatedAt:null;
  return {total:count(snapshot?.total),pending:count(snapshot?.pending),updatedAt:time};
}
