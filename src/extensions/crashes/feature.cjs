// «Крэши»: Sentry crash overview in the chat — totals for a period, a stacked daily events chart, the top issues
// with 14-day sparklines, «новый» marks, crash-free rate of a named release, and per-issue actions.
// Everything shown is computed from Sentry's answers; the local model only adds an optional one-line
// «что общего» under the list. Resolving an issue happens only when the user presses «Решено» on the card.
const kit=require('../app-kit.cjs');
const sentry=require('./client.cjs');
const query=require('./query.cjs');
const ID='crashes',BY='Крэши';
const DAY=86400000;
const TOP=25,STACK=5;

function validate(next){
 next.sentryUrl=sentry.base(next.sentryUrl||sentry.DEFAULT_URL);
 const org=String(next.sentryOrg||'').trim();
 if(org&&!sentry.SLUG.test(org))throw Error('Slug организации Sentry: латиница, цифры, «-» и «_».');
 next.sentryOrg=org;
 const projects=String(next.sentryProjects||'').split(',').map(p=>p.trim()).filter(Boolean);
 if(projects.length>50||projects.some(p=>!sentry.SLUG.test(p)))throw Error('Проекты Sentry указаны неверно.');
 next.sentryProjects=[...new Set(projects)].join(',');
 if(String(next.sentryEnvironment||'').length>64||/[\s,]/.test(String(next.sentryEnvironment||'').trim()))throw Error('Окружение Sentry — одно имя без пробелов, например production.');
 if(String(next.sentryQuery||'').length>300)throw Error('Дополнительный фильтр Sentry слишком длинный.');
}

const number=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:0;};
const dayKey=ms=>new Date(ms).toISOString().slice(0,10);
// 14 daily buckets of one issue (Sentry gives [unixSeconds, count] pairs) mapped onto the chart days.
function series(issue,days){
 const by=new Map();
 for(const [ts,count] of issue?.stats?.['14d']||[])if(Number.isFinite(ts)){const k=dayKey(ts*1000);by.set(k,(by.get(k)||0)+number(count));}
 return days.map(d=>by.get(d)||0);
}
function chartDays(now,count){const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());return Array.from({length:count},(_,i)=>dayKey(today-(count-1-i)*DAY));}

function row(issue,since,days,spark){
 const first=Date.parse(issue.firstSeen);
 return {id:String(issue.id),shortId:String(issue.shortId||''),title:String(issue.title||issue.metadata?.type||'Без названия').slice(0,300),
  culprit:String(issue.culprit||'').slice(0,300),level:String(issue.level||'error'),events:number(issue.count),users:number(issue.userCount),
  firstSeen:issue.firstSeen||null,lastSeen:issue.lastSeen||null,platform:String(issue.platform||issue.project?.platform||''),
  project:String(issue.project?.slug||''),url:/^https?:\/\//.test(issue.permalink||'')?issue.permalink:'',unhandled:!!issue.isUnhandled,
  status:String(issue.status||'unresolved'),isNew:Number.isFinite(first)&&first>=since,spark:series(issue,spark),days:series(issue,days)};
}

async function common(s,rows){
 if(rows.length<3||!s.settings.model)return '';
 try{
  const r=await kit.modelJSON(s,{system:'Ниже самые частые крэши игры из Sentry. Одной короткой фразой по-русски (до 15 слов) скажи, что у них общего: модуль, тип ошибки, платформа, библиотека. Если общего нет — верни пустую строку. Без чисел и выдумок.',
   user:{crashes:rows.slice(0,6).map(r=>({title:r.title,culprit:r.culprit,platform:r.platform}))},schema:{type:'object',properties:{common:{type:'string'}},required:['common']},predict:120,temperature:0.1});
  const line=String(r?.common||'').replace(/\s+/g,' ').trim();
  return line.length>=8?line.slice(0,200):'';
 }catch{return '';}
}

function summary({rows,totals,label,release,platform,onlyNew}){
 const where=(platform?' на '+platform:'')+(release&&!/релиз/.test(label)?' в релизе '+release:'');
 if(!rows.length)return (onlyNew?'Новых крэшей':'Крэшей')+where+' '+label+' нет.';
 const top=rows[0];
 const head=(label[0].toUpperCase()+label.slice(1))+where+': '+totals.issues+(totals.more?'+':'')+' '+kit.plural(totals.issues,[onlyNew?'новый крэш':'крэш',onlyNew?'новых крэша':'крэша',onlyNew?'новых крэшей':'крэшей'])+', '+
  totals.events.toLocaleString('ru-RU')+' '+kit.plural(totals.events,['событие','события','событий'])+', затронуто до '+totals.users.toLocaleString('ru-RU')+' '+kit.plural(totals.users,['пользователя','пользователей','пользователей'])+'.';
 const fresh=!onlyNew&&totals.fresh?' Новых: '+totals.fresh+'.':'';
 return head+' Чаще всего — «'+top.title+'» ('+top.events.toLocaleString('ru-RU')+').'+fresh;
}

async function crashesTurn(s,command,now=new Date()){
 const c=sentry.config(s);
 const ask=query.parse(command,{now,projects:c.projects,environment:c.environment});
 s.requestProgress?.report('Читаю крэши Sentry');
 const all=await sentry.projects(s);
 const chosen=ask.project?[ask.project]:c.projects;
 const picked=chosen.length?all.filter(p=>chosen.includes(p.slug)):all;
 if(!picked.length)return kit.reply(s,command,{by:BY,question:true,text:chosen.length?'В организации «'+c.org+'» нет проектов '+chosen.join(', ')+'. Выберите проекты в настройках «Крэши».':'В организации «'+c.org+'» нет доступных токену проектов Sentry. Проверьте права токена (project:read).'});
 const projectIds=picked.map(p=>p.id);
 // A release: its exact Sentry versions, and the period starts at the release unless the request names one.
 let rel=null,period=ask.period;
 if(ask.release){
  const found=await sentry.releases(s,ask.release,projectIds);
  if(!found.length)return kit.reply(s,command,{by:BY,question:true,text:'В Sentry нет релиза «'+ask.release+'» в проектах '+picked.map(p=>p.slug).join(', ')+'. Проверьте номер версии.'});
  const dates=found.map(r=>Date.parse(r.date)).filter(Number.isFinite);
  rel={name:ask.release,versions:found.map(r=>r.version).slice(0,10),date:dates.length?new Date(Math.min(...dates)).toISOString():null};
  if(!period){
   const since=rel.date?Date.parse(rel.date):now.getTime()-30*DAY,days=Math.max(1,Math.ceil((now.getTime()-since)/DAY));
   period=days<=90&&rel.date?{label:'после релиза '+ask.release,start:rel.date,end:now.toISOString(),days}:{label:'за 30 дней',statsPeriod:'30d',days:30};
  }
 }
 period=period||{label:'за неделю',statsPeriod:'7d',days:7};
 const search=['is:unresolved',c.query,ask.platform?'os.name:'+ask.platform:'',rel?'release:['+rel.versions.map(v=>JSON.stringify(v)).join(',')+']':''].filter(Boolean).join(' ');
 const span={statsPeriod:period.statsPeriod,start:period.start,end:period.end};
 const raw=await sentry.issues(s,{projectIds,query:search,environment:ask.environment,...span});
 const since=period.start?Date.parse(period.start):now.getTime()-period.days*DAY;
 const days=chartDays(now,Math.min(14,Math.max(7,Math.ceil(period.days))));
 const fortnight=chartDays(now,14);
 let rows=raw.map(i=>row(i,rel?.date?Date.parse(rel.date):since,days,fortnight));
 if(ask.onlyNew)rows=rows.filter(r=>r.isNew);
 rows.sort((a,b)=>b.events-a.events);
 const totals={issues:rows.length,more:raw.length>=100&&!ask.onlyNew,events:rows.reduce((n,r)=>n+r.events,0),users:rows.reduce((n,r)=>n+r.users,0),fresh:rows.filter(r=>r.isNew).length};
 // Stacked chart: the five most frequent issues and the rest together, per day.
 const stack=rows.slice(0,STACK).map(r=>({id:r.id,label:r.title,values:r.days}));
 const rest=days.map((_,i)=>rows.slice(STACK).reduce((n,r)=>n+r.days[i],0));
 if(rest.some(Boolean))stack.push({id:'rest',label:'остальные',values:rest});
 let health=null;
 if(rel){s.requestProgress?.report('Считаю crash-free для релиза');health=await sentry.crashFree(s,{projectIds,versions:rel.versions,environment:ask.environment,...span}).catch(()=>null);}
 const top=rows.slice(0,TOP).map(({days,...r})=>r);
 if(rows.length>=3)s.requestProgress?.report('Ищу общее у частых крэшей');
 const line=await common(s,top);
 const text=summary({rows,totals,label:period.label,release:rel?.name,platform:ask.platform,onlyNew:ask.onlyNew});
 const card={org:c.org,projects:picked.map(p=>p.slug),url:sentry.issuesUrl(s,{projectIds,query:search,environment:ask.environment,...span}),
  period:{label:period.label,from:new Date(since).toISOString(),to:period.end||now.toISOString()},release:rel,platform:ask.platform,environment:ask.environment||'',onlyNew:ask.onlyNew,
  totals,crashFree:health,chart:{days,series:stack,from:dayKey(period.calendar?since+DAY/2:since),to:period.calendar?dayKey(Date.parse(period.end)-DAY/2):dayKey(now.getTime())},issues:top,common:line};
 return kit.reply(s,command,{by:BY,text,data:{crashCard:card},sources:[{title:'Sentry · '+c.org,url:card.url}]});
}

function setup(s){
 const ready=()=>{if(!kit.installed(s,ID))throw Error('Расширение «Крэши» не добавлено.');if(!sentry.connected(s))throw Error('Sentry не подключён. Откройте Настройки → «Крэши».');};
 return {ipc:{
  status:()=>{let c={};try{c=sentry.config(s);}catch{}return {hasToken:!!s.settings.sentryToken,url:c.url||sentry.DEFAULT_URL,org:c.org||'',projects:c.projects||[],environment:c.environment||''};},
  organizations:async()=>{if(!s.settings.sentryToken)throw Error('Сначала сохраните токен Sentry.');return sentry.organizations(s);},
  projects:async()=>{if(!sentry.connected(s))throw Error('Сначала сохраните токен и организацию Sentry.');return sentry.projects(s);},
  // Called only from the card's «Решено» button and its «Отменить» toast.
  resolve:async id=>{ready();await sentry.setStatus(s,id,'resolved');return {id,status:'resolved',text:'Отмечено решённым в Sentry'};},
  reopen:async id=>{ready();await sentry.setStatus(s,id,'unresolved');return {id,status:'unresolved',text:'Снова открыто в Sentry'};}
 }};
}

async function turn(s,command){
 const text=String(command||'');
 if(!query.about(text)||!kit.installed(s,ID))return null;
 if(!sentry.connected(s))return kit.reply(s,command,{by:BY,question:true,text:'Sentry ещё не подключён. Откройте Настройки → «Крэши»: вставьте токен Sentry (org:read, project:read, event:read), организацию и выберите проекты — потом повторите вопрос.'});
 try{return await crashesTurn(s,text);}
 catch(e){return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+(e.message||'Sentry недоступен.')});}
}
module.exports={name:'crashes',defaults:{['extension_'+ID]:'false',sentryUrl:sentry.DEFAULT_URL,sentryOrg:'',sentryProjects:'',sentryEnvironment:'',sentryQuery:'',sentryToken:''},
 secrets:['sentryToken'],validate,setup,turn,crashesTurn,summary};
