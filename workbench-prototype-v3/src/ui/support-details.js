function node(tag,text,className){const element=document.createElement(tag);if(text)element.textContent=text;if(className)element.className=className;return element;}
function time(value){return value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+' 北京时间':'尚无查询时间';}
export function renderSupportDetails(host,card){
  host.classList.add('support-details');
  const intro=node('section',null,'support-intro');
  const content=node('div',null,'support-list');
  if(card.id==='connections'){
    intro.append(node('h2','模型账户余额'),node('p','销售业务、知识试问与对接表主模型'));
    for(const balance of card.balances||[]){
      const row=node('section',null,'support-row');
      const title=node('div');title.append(node('h3',balance.name),node('p',time(balance.time)));
      const result=node('div',null,'support-result');
      result.append(node('strong',balance.amount===null?'尚无余额记录':`¥${balance.amount.toFixed(2)}`));
      result.append(node('span',balance.error?(balance.amount===null?'查询失败':'更新失败，显示上次余额'):balance.amount===null?'等待查询':balance.low?'余额偏低':'余额已取得',balance.error||balance.low?'support-warning':''));
      row.append(title,result);content.append(row);
    }
  }else{
    intro.append(node('h2',card.fact),node('p','部署资料齐备后，仍需按目标环境检查连接、数据与恢复资源。'));
    const labels=['部署入口','迁移操作流程','智能体接手与验收'];
    for(const [index,document] of (card.documents||[]).entries()){
      const row=node('section',null,'support-row');const description=node('div');
      description.append(node('h3',labels[index]||'接手资料'),node('p',document.file));
      row.append(description,node('strong',document.exists?'已找到':'未取得',document.exists?'':'support-warning'));content.append(row);
    }
  }
  const evidence=node('details',null,'support-evidence');
  evidence.append(node('summary','来源与观测范围'),node('p',card.detail),node('p',`读取时间：${time(card.observedAt)}`),node('p',card.source));
  host.replaceChildren(intro,content,evidence);
}
