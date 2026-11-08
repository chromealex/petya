// Reminder trigger «задача Jira сменила статус»: «напомни, когда закроют BW-123», «когда BW-7 перейдёт в Review».
// Polls GET /rest/api/3/issue/{key}?fields=summary,status through Petya's Jira connection (no webhook needed):
// every 2 minutes at first, then less often (×1.5 per check, up to 30 minutes).
const {TriggerError}=require('./triggers.cjs');
const modules=require('../../modules.cjs');
const KEY=/(?<![A-Za-z0-9])([A-Z][A-Z0-9_]{1,9}-\d{1,7})(?![A-Za-z0-9-])/u;
const DONE=/(?:закро\p{L}*|закрыт\p{L}*|сдела\p{L}*|реш\p{L}*|исправ\p{L}*|почин\p{L}*|зарелиз\p{L}*|выкат\p{L}*|задепло\p{L}*|будет готов\p{L}*|додела\p{L}*|заверш\p{L}*)/iu;
const MOVE=/(?:перейд[её]т|перевед[уё]т|переведут|переедет|окажется|попад[её]т|сменит статус|смени\p{L}* статус|изменится статус|поменя\p{L}* статус)(?:\s+(?:в|на))?(?:\s+статус)?\s+[«"“]?([\p{L}\d][\p{L}\d _-]{0,30}?)[»"”]?(?=$|[\s,.!?])/iu;
const ready=s=>modules.enabled(s,'jira')&&!!s.jiraUrl&&!!(s.atlassianCredential||s.jiraEmail&&s.jiraToken);
async function read(s,key){
 const settings={...s.workspace.settings(),jiraProject:key.split('-')[0]};
 const data=await s.workspace.api('/rest/api/3/issue/'+encodeURIComponent(key)+'?fields=summary,status',{},settings);
 const f=data?.fields||{};
 return {key:String(data?.key||key),summary:String(f.summary||'').slice(0,200),status:String(f.status?.name||''),category:String(f.status?.statusCategory?.key||'')};
}
const reached=(issue,params)=>params.status?issue.status.toLocaleLowerCase('ru')===params.status.toLocaleLowerCase('ru'):issue.category==='done';
const browse=(s,key)=>{try{return new URL('/browse/'+encodeURIComponent(key),s.settings.jiraUrl).href;}catch{return '';}};
module.exports={
 id:'jira-status',name:'Статус задачи Jira',icon:'task',
 connect:'Подключите Jira в настройках («Подключения» → Jira).',
 match(text){
  const t=String(text);if(!/(?:^|[^\p{L}])когда(?=$|[^\p{L}])/iu.test(t))return null;
  const key=KEY.exec(t)?.[1];if(!key)return null;
  const move=MOVE.exec(t);
  if(move)return {key,status:move[1].trim()};
  return DONE.test(t)?{key,status:''}:null;
 },
 ready,
 async prepare(s,params){
  let issue;
  try{issue=await read(s,params.key);}
  catch(e){if(e.status===404)throw new TriggerError('not-found','Задачу '+params.key+' в Jira не нашёл или к ней нет доступа.');throw e;}
  if(reached(issue,params))throw new TriggerError('already',issue.key+' уже '+(params.status?'в статусе «'+issue.status+'»':'закрыта ('+issue.status+')')+'.',{url:browse(s,issue.key)});
  return {params:{...params,summary:issue.summary},label:issue.key+(params.status?' перейдёт в «'+params.status+'»':' закроют'),url:browse(s,issue.key),note:issue.summary?issue.key+' «'+issue.summary+'» сейчас: '+issue.status+'.':''};
 },
 async check(s,params){
  const issue=await read(s,params.key);
  if(!reached(issue,params))return {fired:false,state:{status:issue.status}};
  return {fired:true,text:issue.key+(issue.summary?' «'+issue.summary+'»':'')+' — статус «'+issue.status+'».',url:browse(s,issue.key)};
 },
 every(checks){return Math.min(30*60000,Math.round(2*60000*Math.pow(1.5,checks)));}
};
