// Read Jira identities first, then join Slack profiles without writing the team directory.
const norm=v=>String(v||'').trim().toLocaleLowerCase().replace(/ё/g,'е');
const matches=text=>/(?:jira|джир|жир)/iu.test(text)&&/(?:slack|слак)/iu.test(text)&&/(?:имен|имена|люд|сотрудник|коллег)/iu.test(text)&&/(?:должност|рол[ьи])/iu.test(text);
async function turn(command,s){
 if(!matches(command))return null;
 const access=await s.serviceAccess.offer(command,s.dialogue.active());if(access)return access;
 s.requestProgress?.report('Получаю список людей из Jira');
 const settings={...s.workspace.settings()},people=new Map();let complete=false;
 for(let start=0;start<10000;start+=100){
  const rows=await s.workspace.api('/rest/api/3/users/search?startAt='+start+'&maxResults=100',{},settings);
  if(!Array.isArray(rows))throw Error('Jira вернула неизвестный формат списка людей.');
  for(const p of rows)if(p.accountId&&p.displayName&&p.accountType==='atlassian')people.set(p.accountId,p);
  if(rows.length<100){complete=true;break;}
 }
 const wanted=[...people.values()].map(p=>({name:p.displayName,email:p.emailAddress||''}));
 s.requestProgress?.report('Ищу должности этих людей в профилях Slack');
 const slack=wanted.length?await require('../team-enrich.cjs').slackProfiles(s.settings,s.request,wanted):{profiles:[],complete:true};
 const lines=wanted.map(p=>{
  const byEmail=p.email?slack.profiles.filter(x=>norm(x.email)===norm(p.email)):[];
  const found=byEmail.length?byEmail:slack.profiles.filter(x=>x.names.includes(norm(p.name)));
  const status=found.length>1?'несколько совпадений в Slack':found.length===1?(found[0].title||'должность в профиле не указана'):slack.complete?'профиль Slack не найден':'профиль пока не найден — проверка Slack неполная';
  return '- '+p.name.replace(/[\r\n]/g,' ')+' — '+status.replace(/[\r\n]/g,' ');
 });
 const text=(complete?'Люди из Jira':'Частичный список людей из Jira')+': '+wanted.length+'. Должности из профилей Slack.\n\n'+(lines.join('\n')||'Доступных людей не найдено.')+(slack.limited?'\n\nSlack ограничил запросы.':'');
 s.dialogue.rememberAction(command,text);const topic=s.dialogue.active();return {handled:true,text,topicId:topic.id,messages:topic.messages,by:'Jira → Slack'};
}
module.exports={name:'jira-slack-people',matches,turn,setup:s=>({jiraSlackPeople:{turn:command=>turn(command,s)}})};
