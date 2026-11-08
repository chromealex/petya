// Reminder trigger «коллега появился в Slack»: «напомни, когда Олег появится в сети». Reads users.getPresence
// (https://api.slack.com/methods/users.getPresence), which needs the users:read scope of the current token. Without
// it Slack answers `missing_scope` — then the reminder is not created and Petya offers a time reminder instead.
// The person comes from «Команда» (Slack ID); presence is polled every 2 minutes.
const {TriggerError}=require('./triggers.cjs');
const modules=require('../../modules.cjs');
const people=require('./people.cjs');
const WHO='(\\p{Lu}\\p{Ll}{1,20})(?:\\s+\\p{Lu}\\p{Ll}{1,25})?';
const ONLINE=new RegExp('когда\\s+'+WHO+'\\s+(?:появится|будет|выйдет|зайд[её]т|станет|окажется|снова будет)\\s+(?:в\\s+сети|онлайн|online|в\\s+слаке|в\\s+slack|активн\\p{L}*)','u');
const NO_SCOPE=['missing_scope','not_allowed_token_type','no_permission','invalid_auth','not_authed','account_inactive','token_revoked'];
const ready=s=>modules.enabled(s,'slack')&&!!(s.slackToken||s.slackCredential);
async function presence(s,user){
 const r=await s.request('https://slack.com/api/users.getPresence?'+new URLSearchParams({user}),{headers:{Authorization:'Bearer '+(s.settings.slackToken||'')}});
 if(!r?.ok){const e=Error('Slack: '+(r?.error||'нет ответа'));e.slack=r?.error||'';e.needed=r?.needed||'';throw e;}
 return r.presence==='active'?'active':'away';
}
module.exports={
 id:'slack-presence',name:'Коллега в сети (Slack)',icon:'presence',
 connect:'Подключите Slack в настройках («Подключения» → Slack).',
 match(text){const m=ONLINE.exec(String(text));return m?{name:m[1]}:null;},
 ready,
 async prepare(s,params){
  const found=people.find(s.settings,params.name);
  if(found.length>1)throw new TriggerError('not-found','В «Команде» несколько человек с именем '+params.name+': '+found.map(p=>p.name).join(', ')+'. Назовите полное имя.');
  const person=found[0];
  if(!person)throw new TriggerError('not-found','Не нашёл '+params.name+' в «Команде». Добавьте человека и его Slack ID — тогда смогу следить, когда он в сети.');
  if(!person.slackId)throw new TriggerError('not-found','У '+person.name+' в «Команде» нет Slack ID — без него не узнать, в сети ли он.');
  let now;
  try{now=await presence(s,person.slackId);}
  catch(e){
   if(NO_SCOPE.includes(e.slack))throw new TriggerError('unsupported','Текущий токен Slack не может смотреть, кто в сети: нужно разрешение users:read'+(e.slack==='missing_scope'?'':' ('+e.slack+')')+'. Его можно добавить в настройках приложения Slack и переподключить Slack.');
   throw e;
  }
  const away=now==='active';
  return {params:{name:person.name,user:person.slackId,needAway:away},label:person.name+' появится в сети',
   note:away?person.name+' сейчас уже в сети — напомню, когда снова появится после отлучки.':''};
 },
 async check(s,params,{state={}}={}){
  const now=await presence(s,params.user);
  if(params.needAway&&!state.sawAway)return {fired:false,state:{sawAway:now==='away'}};
  if(now!=='active')return {fired:false,state:{...state,sawAway:true}};
  return {fired:true,text:params.name+' сейчас в сети в Slack.'};
 },
 every(){return 2*60000;}
};
