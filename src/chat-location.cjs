const {createHash}=require('node:crypto');
const digest=m=>createHash('sha256').update(JSON.stringify([m.role,m.at,m.text])).digest('hex').slice(0,24);
const validId=s=>typeof s==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(s);
function parse(raw){
  if(typeof raw!=='string'||raw.length>600)return null;
  const m=/^petya:\/\/message\/([\w-]+)\/([\w-]+)\/([\w-]+)\/(\d{1,9})\/(\d{1,9})\/([a-f0-9]{24})$/.exec(raw);
  if(!m||!m.slice(1,4).every(validId))return null;
  return {company:m[1],project:m[2],chat:m[3],version:Number(m[4]),index:Number(m[5]),digest:m[6]};
}
function messages(topic,version){
  if(!Number.isInteger(version)||version<0||version>=(topic.versions?.length||1))throw Error('Эта версия больше недоступна.');
  return version===(topic.versionIndex||0)?topic.messages:topic.versions[version].messages;
}
function link(company,t,version,index){
  const m=messages(t,version)[index];if(!m || m.pending)throw Error('Сообщение ещё не сохранено.');
  return 'petya://message/'+[company,t.projectId||'general',t.id,version,index,digest(m)].join('/');
}
function resolve(state,location){
  const t=state.topics.find(t=>t.id===location.chat && !t.archived);
  if(!t||!state.projects.some(p=>p.id===(t.projectId||'general')&&!p.archived))throw Error('Чат недоступен или находится в архиве.');
  const rows=messages(t,location.version);
  const index=rows[location.index] && digest(rows[location.index])===location.digest?location.index:rows.findIndex(m=>digest(m)===location.digest);
  if(index<0)throw Error('Сообщение по этой ссылке больше недоступно.');
  return {chat:t.id,project:t.projectId||'general',version:location.version,index};
}
function attention(t){
  if(t.chatJob?.state!=='attention')return '';
  const r=t.lastChatResult||{};
  // Seen errors and answers leave the list; a pending approval or question stays until it is answered.
  if(t.chatJob.acknowledged&&!r.computerApproval&&!r.clarificationOptions?.length&&!r.question&&!r.integrationChoices?.length)return '';
  if(r.computerApproval)return 'Разрешить управление компьютером';
  if(r.clarificationOptions?.length || r.question)return String(r.text||'Ответить на уточнение').slice(0,180);
  if(r.integrationChoices?.length)return 'Выбрать подключение';
  return String(r.text||t.chatJob.label||'Проверить ответ').slice(0,180);
}
module.exports={link,parse,resolve,attention};
