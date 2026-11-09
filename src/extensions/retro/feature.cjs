// «Ретро»: the sprint's facts (collect.cjs: Jira velocity / carry-over / bugs through «Планирование спринта»'s client,
// CI failures, incidents, decisions and complaints from meeting summaries and messengers), every one with its source,
// and drafts «что хорошо / что плохо / что попробовать» grounded in them (drafts.cjs). The card collects the team's
// votes (stored per company, per retro) and hands action items to the task tracker through the `task-tracker` link,
// whose own flow previews and creates them only after the user confirms. Nothing here writes to any service.
// Neighbours: planning the next sprint and velocity alone are «Планирование спринта»; a single meeting's summary is
// Petya's own; «что пошло не так» with a build is «Сборки».
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const agile=require('../sprint-planning/agile.cjs');
const collect=require('./collect.cjs');
const {drafts}=require('./drafts.cjs');
const ID='retro',BY='Ретро';
const DAY=86400000;

// --- Routing --------------------------------------------------------------------------------------------------
const clean=t=>String(t||'').replace(/^\s*петя[\s,:.!?—-]*/iu,'').replace(/[.!?]+$/u,'').replace(/ё/g,'е').trim();
const RETRO='ретро(?:спектив\\p{L}*)?(?![\\p{L}-])';
const SPRINT='(?:спринт|итерац)\\p{L}*';
const ROUTES=[
 // «подготовь ретро», «собери ретроспективу по спринту 14», «проведём ретро команды»
 new RegExp('^(?:давай\\s+)?(?:подготов|собер|провед|сдела|состав|запуст|покаж|начн|начина|нужн)\\p{L}*\\s+(?:нам\\s+|мне\\s+)?(?:\\p{L}+\\s+)?'+RETRO+'(?:\\s+(?:по\\s+|для\\s+|за\\s+)?(?:'+SPRINT+'|команд\\p{L}*|прошл\\p{L}*\\s+'+SPRINT+'|последн\\p{L}*\\s+'+SPRINT+')(?:\\s+.{0,60})?)?$','iu'),
 // «ретро спринта», «ретроспектива по спринту 14», «ретро»
 new RegExp('^'+RETRO+'(?:\\s+(?:по\\s+|для\\s+|за\\s+)?(?:прошл\\p{L}*\\s+|последн\\p{L}*\\s+|этого\\s+)?'+SPRINT+'(?:\\s+.{0,60})?)?$','iu'),
 // «что пошло не так в спринте», «что было хорошо в прошлом спринте»
 new RegExp('^(?:а\\s+)?что\\s+(?:у\\s+нас\\s+)?(?:пошло|было|прошло|получилось)\\s+(?:не\\s+так|плохо|хорошо|не\\s+очень)\\s+(?:в|за)\\s+(?:эт\\p{L}*\\s+|прошл\\p{L}*\\s+|последн\\p{L}*\\s+|нашем\\s+)?'+SPRINT+'(?:\\s+.{0,40})?$','iu'),
 // «итоги спринта», «подведи итоги спринта»
 new RegExp('^(?:подвед\\p{L}*\\s+|покажи\\s+)?итог\\p{L}*\\s+(?:прошл\\p{L}*\\s+|этого\\s+|последн\\p{L}*\\s+)?'+SPRINT+'(?:\\s+.{0,40})?$','iu')
];
function kind(text){
 const t=clean(text);
 if(!t||/^\/|(?:^|\s)скилл/iu.test(t))return null;
 if(/^(?:а\s+)?(?:что\s+такое|зачем\s+нуж|как\s+(?:провести|проводить|вести))/iu.test(t))return null;
 return ROUTES.some(r=>r.test(t))?'retro':null;
}
// «ретро спринта 14», «по спринту «GAME Sprint 14»»: the sprint the user named.
function named(text){
 const t=String(text||'');
 const q=/[«"]([^»"]{2,120})[»"]/u.exec(t)?.[1];if(q)return q.trim();
 return /(?:спринт|итерац)\p{L}*\s+(?:№\s*)?(\d{1,5})(?=$|[^\d])/iu.exec(t)?.[1]||'';
}

// --- Project and board ---------------------------------------------------------------------------------------------
function project(s,resume){
 const {allowed}=require('../../jira-routing.cjs');
 const keys=allowed(s.settings),topic=s.dialogue.active();
 const binding=s.projectMemory?.get?.(topic?.projectMemoryId)?.jira;
 const bound=topic?.jiraProject||(binding?.site===s.settings.jiraUrl&&binding.key);
 if(bound&&keys.includes(bound))return bound;
 if(keys.length===1)return keys[0];
 if(s.settings.jiraProject&&keys.includes(s.settings.jiraProject))return s.settings.jiraProject;
 if(!keys.length)return {question:'Отметьте доступные Пете проекты в подключениях Jira — тогда подготовлю ретро.'};
 return ask({text:'По какому проекту Jira готовить ретро?',label:'Проект Jira',options:keys.slice(0,12),strictChoices:true},answer=>resume(keys.find(k=>k.toLowerCase()===String(answer).trim().toLowerCase())));
}
const store=s=>require('../../extension-cache.cjs').store(s.dataRoot,ID);
async function board(s,key,resume){
 const list=await agile.boards(s,key);
 if(!list.length)return {question:'В проекте '+key+' нет scrum-доски Jira: спринты бывают только на scrum-досках.'};
 const remembered=store(s).peek('board:'+s.settings.jiraUrl+':'+key);
 const chosen=list.find(b=>b.id===String(s.settings.jiraProject===key&&s.settings.jiraBoardId||''))||list.find(b=>b.id===remembered)||(list.length===1?list[0]:null);
 if(chosen)return chosen;
 const label=b=>b.name+' · '+b.id;
 return ask({text:'В проекте '+key+' несколько scrum-досок. По какой готовить ретро? Запомню выбор.',label:'Доска',options:list.slice(0,12).map(label),strictChoices:true},answer=>{
  const b=list.find(x=>label(x).toLowerCase()===String(answer).trim().toLowerCase());
  if(!b)return {handled:true,text:'Такой доски нет. Повторите запрос.',error:true};
  store(s).set('board:'+s.settings.jiraUrl+':'+key,b.id);return resume(b);
 });
}
function team(s){
 try{return require('../../team.cjs').members(s.settings).filter(m=>m&&m.name).slice(0,12).map(m=>({key:String(m.jiraId||m.email||m.name).slice(0,120),name:String(m.name).slice(0,80)}));}catch{return [];}
}

// --- The retro -------------------------------------------------------------------------------------------------------
async function build(s,key,b,{now=new Date(),named:wanted=''}={}){
 const site=String(s.settings.jiraUrl||'').replace(/\/+$/,'');
 s.requestProgress?.report?.('Читаю спринт в Jira');
 const j=await collect.jira(s,key,b,{now,named:wanted});
 if(!j.sprint)return null;
 const since=new Date(Date.parse(j.sprint.start||'')||+now-14*DAY),until=new Date(Math.min(+now,Date.parse(j.sprint.end||'')||+now));
 const notes=[];
 s.requestProgress?.report?.('Смотрю CI, инциденты, встречи и чаты за спринт');
 const [c,inc,msg]=await Promise.all([
  collect.ci(s,{since,until}).catch(e=>({facts:[],used:true,notes:['Сборки: '+e.message]})),
  collect.incidents(s,{since,until,now}).catch(e=>({facts:[],used:true,notes:['Мониторинг: '+e.message]})),
  collect.messengers(s,{since,until}).catch(e=>({facts:[],used:[],notes:['Мессенджеры: '+e.message]}))
 ]);
 let memory=[];try{memory=s.memory?.prune?.()||[];}catch{memory=[];}
 const m=collect.meetings(memory,{since,until});
 notes.push(...c.notes,...inc.notes,...msg.notes);
 const facts=[...j.facts,...c.facts,...inc.facts,...m.facts,...msg.facts].map((f,i)=>({id:'F'+(i+1),...f}));
 const d=await drafts(s,facts);
 if(!c.used)notes.push('CI не подключён: добавьте «Сборки», чтобы видеть падения сборок.');
 if(!inc.used)notes.push('Мониторинг не подключён — инциденты не учтены.');
 if(!m.used)notes.push('Сводок встреч за спринт нет.');
 return {retroId:randomUUID(),project:key,site,board:{id:b.id,name:b.name,url:site+'/secure/RapidBoard.jspa?rapidView='+encodeURIComponent(b.id)},
  sprint:j.sprint,estimation:{mode:j.estimation.mode,label:j.estimation.label},velocity:j.velocity,facts,drafts:d,team:team(s),
  sources:{jira:true,ci:c.used,monitoring:inc.used,meetings:m.count||0,messengers:msg.used},notes:notes.slice(0,6),at:now.toISOString()};
}

function summary(card){
 const d=card.drafts,first=list=>list.slice(0,2).map(x=>x.text.replace(/[.\s]+$/,'')).join('; ');
 const from=['Jira',card.sources.ci&&'CI',card.sources.monitoring&&'мониторинга',card.sources.meetings&&'встреч',card.sources.messengers.length&&card.sources.messengers.join(', ')].filter(Boolean);
 return 'Ретро «'+card.sprint.name+'»: '+card.facts.length+' '+kit.plural(card.facts.length,['факт','факта','фактов'])+' из '+from.join(', ')+'.'
  +(d.good.length?' Хорошо: '+first(d.good)+'.':'')+(d.bad.length?' Плохо: '+first(d.bad)+'.':'')+(d.try.length?' Попробовать: '+first(d.try)+'.':'')
  +' Голоса — на карточке; задачи создаю только через трекер после подтверждения.';
}

async function retroTurn(s,command,deps={}){
 const wanted=named(command);
 const run=async key=>{
  if(!key)return kit.reply(s,command,{by:BY,text:'Такого проекта нет. Повторите запрос.',error:true});
  if(key.question)return kit.reply(s,command,{by:BY,question:true,text:key.question});
  const b=await board(s,key,picked=>go(key,picked));
  return b.question?kit.reply(s,command,{by:BY,question:true,text:b.question}):go(key,b);
 };
 const go=async(key,b)=>{
  const card=await build(s,key,b,{now:deps.now||new Date(),named:wanted});
  if(!card)return kit.reply(s,command,{by:BY,question:true,text:'На доске «'+b.name+'» нет ни активного, ни закрытого спринта — ретро не по чему готовить.'});
  return kit.reply(s,command,{by:BY,text:summary(card),data:{retroCard:card},sources:[{title:'Jira · '+card.sprint.name,url:card.facts[0]?.source?.url||card.board.url}]});
 };
 return run(project(s,run));
}

// --- Votes -----------------------------------------------------------------------------------------------------------
const VOTES=60;
function votes(s,retroId){
 const all=store(s).peek('votes')||{};
 return all[retroId]?.items||{};
}
function vote(s,retroId,itemId,voter,on){
 const st=store(s),all={...st.peek('votes')||{}};
 const entry=all[retroId]||{at:Date.now(),items:{}};
 const list=new Set(entry.items[itemId]||[]);
 if(on)list.add(voter);else list.delete(voter);
 entry.items={...entry.items,[itemId]:[...list]};entry.at=Date.now();
 all[retroId]=entry;
 // Keep the latest retros only.
 const keep=Object.entries(all).sort((a,b)=>b[1].at-a[1].at).slice(0,VOTES);
 st.set('votes',Object.fromEntries(keep));
 return entry.items;
}

function setup(s){
 const valid=(v,max=120)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f]/.test(v);
 return {ipc:{
  votes(retroId){
   if(!kit.installed(s,ID))throw Error('Приложение «Ретро» не добавлено.');
   if(!valid(retroId,64))throw Error('Некорректное ретро.');
   return votes(s,retroId);
  },
  vote(retroId,itemId,voter,on){
   if(!kit.installed(s,ID))throw Error('Приложение «Ретро» не добавлено.');
   if(!valid(retroId,64)||!/^(?:good|bad|try)-\d{1,2}$/.test(String(itemId))||!valid(voter))throw Error('Некорректный голос.');
   return vote(s,retroId,itemId,voter,!!on);
  }
 }};
}

async function turn(s,command,deps={}){
 if(!kit.installed(s,ID))return null;
 if(!kind(command))return null;
 if(!agile.connected(s))return kit.reply(s,command,{by:BY,question:true,text:'Для ретро нужна Jira: по ней беру спринт, скорость, перенос и баги. Подключите её в «Подключениях» → Jira и отметьте проекты, потом повторите вопрос.'});
 try{return await retroTurn(s,String(command),deps);}
 catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}
module.exports={name:'retro',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,kind,named,build,summary,votes,vote,teardown(){}};
