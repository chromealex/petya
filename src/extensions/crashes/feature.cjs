// «Крэши»: an app's crashes from every connected crash source (Sentry, Firebase Crashlytics, Google Play, …) in one
// chat card — totals per source, a stacked daily chart (by issue or by source), the top issues with their source,
// 14-day sparklines, «новый» marks, crash-free rate of a named release, and per-issue actions.
// The app knows no crash service: sources are extensions that declare a `crash-source` (src/features/crash-sources.cjs).
// Issues are not merged across sources (the same bug in Sentry and Crashlytics stays two rows); the card groups them.
// Everything shown is computed from the sources' answers; the local model only adds an optional «что общего» line.
// Writes (Решено / Отменить) happen only when the user presses a card button, and only for sources that support it.
const kit=require('../app-kit.cjs');
const query=require('./query.cjs');
const ID='crashes',BY='Крэши';
const DAY=86400000;
const TOP=25,PER_SOURCE=12,STACK=5;

const registry=s=>s.crashSources||require('../../features/crash-sources.cjs').create(s);
const dayKey=ms=>new Date(ms).toISOString().slice(0,10);
function chartDays(now,count){const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());return Array.from({length:count},(_,i)=>dayKey(today-(count-1-i)*DAY));}
const values=(issue,days)=>{const by=new Map(issue.daily.map(d=>[d.day,d.count]));return days.map(d=>by.get(d)||0);};
const names=list=>list.length<=1?list.join(''):list.slice(0,-1).join(', ')+' или '+list.at(-1);

async function common(s,rows){
 if(rows.length<3||!s.settings.model)return '';
 try{
  const r=await kit.modelJSON(s,{system:'Ниже самые частые крэши игры. Одной короткой фразой по-русски (до 15 слов) скажи, что у них общего: модуль, тип ошибки, платформа, библиотека. Если общего нет — верни пустую строку. Без чисел и выдумок.',
   user:{crashes:rows.slice(0,6).map(r=>({title:r.title,culprit:r.culprit,platform:r.platform}))},schema:{type:'object',properties:{common:{type:'string'}},required:['common']},predict:120,temperature:0.1});
  const line=String(r?.common||'').replace(/\s+/g,' ').trim();
  return line.length>=8?line.slice(0,200):'';
 }catch{return '';}
}

const fmt=n=>n.toLocaleString('ru-RU');
function summary({rows,totals,sources,label,release,platform,onlyNew}){
 const where=(platform?' на '+platform:'')+(release&&!/релиз/.test(label)?' в релизе '+release:'');
 if(!rows.length)return (onlyNew?'Новых крэшей':'Крэшей')+where+' '+label+' нет'+(sources.length>1?' ('+sources.map(x=>x.name).join(', ')+')':'')+'.';
 const top=rows[0],multi=sources.length>1;
 const head=(label[0].toUpperCase()+label.slice(1))+where+': '+totals.issues+(totals.more?'+':'')+' '+kit.plural(totals.issues,[onlyNew?'новый крэш':'крэш',onlyNew?'новых крэша':'крэша',onlyNew?'новых крэшей':'крэшей'])+
  (multi?' ('+sources.filter(x=>x.issues).map(x=>x.name+' — '+x.issues+(x.more?'+':'')).join(', ')+')':'')+', '+
  fmt(totals.events)+' '+kit.plural(totals.events,['событие','события','событий'])+', затронуто до '+fmt(totals.users)+' '+kit.plural(totals.users,['пользователя','пользователей','пользователей'])+'.';
 const fresh=!onlyNew&&totals.fresh?' Новых: '+totals.fresh+'.':'';
 return head+' Чаще всего — «'+top.title+'» ('+(multi?sources.find(x=>x.id===top.source)?.name+', ':'')+fmt(top.events)+').'+fresh;
}

// Not one asked source is ready: the shared offer card lists the sources to connect, the request resumes afterwards.
function connectQuestion(s,command,list,{named=false}={}){
 const text=named?(list.length===1?'«'+list[0].name+'» ещё не подключён к «Крэшам». Подключить?':names(list.map(x=>'«'+x.name+'»'))+' ещё не подключены к «Крэшам». Какой подключить?'):
  'Крэши пока неоткуда взять: подключите источник — '+names(list.map(x=>x.name))+'. Какой подключить?';
 const offered=s.extensionOffers?.propose?.(command,[...new Set(list.map(x=>x.extension))],text,BY);
 return offered||kit.reply(s,command,{by:BY,question:true,text});
}

async function crashesTurn(s,command,now=new Date()){
 const reg=registry(s),all=reg.all();
 const named=reg.named(command);
 const asked=named.length?all.filter(x=>named.includes(x.id)):all;
 const targets=asked.filter(x=>x.ready);
 if(!targets.length)return connectQuestion(s,command,asked.length?asked:all,{named:!!named.length});
 const ask=query.parse(command,{now});
 s.requestProgress?.report('Читаю крэши: '+targets.map(x=>x.name).join(', '));
 // A release: sources that know releases give its date (the period starts there unless the request names one).
 const found={};let rel=null,period=ask.period;
 if(ask.release){
  for(const x of targets){try{found[x.id]=await reg.release(x.id,ask.release);}catch{found[x.id]=null;}}
  const dates=Object.values(found).map(r=>Date.parse(r?.date)).filter(Number.isFinite);
  rel={name:ask.release,date:dates.length?new Date(Math.min(...dates)).toISOString():null};
  if(!period){
   const since=rel.date?Date.parse(rel.date):now.getTime()-30*DAY,days=Math.max(1,Math.ceil((now.getTime()-since)/DAY));
   period=days<=90&&rel.date?{label:'после релиза '+ask.release,start:rel.date,end:now.toISOString(),days,kind:'release'}:query.period('за месяц',now);
  }
 }
 period=period||query.period('за неделю',now);
 const since=rel?.date?Date.parse(rel.date):Date.parse(period.start);
 const base={text:command,period,since,release:ask.release,platform:ask.platform,environment:ask.environment,onlyNew:ask.onlyNew,now};
 const results=await Promise.all(targets.map(async x=>{
  const q={...base,found:found[x.id]||null};
  try{
   const r=await reg.issues(x.id,q);
   let health=null;if(ask.release){try{health=await reg.crashFree(x.id,q);}catch{health=null;}}
   return {...x,...r,crashFree:health&&(health.sessions!=null||health.users!=null)?health:null};
  }catch(e){return {...x,issues:[],error:e.message||'недоступен'};}
 }));
 // Every source failed: an error reply naming each failure.
 if(results.every(r=>r.error))return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+results.map(r=>results.length>1?r.name+': '+r.error:r.error).join(' ')});
 const days=chartDays(now,Math.min(14,Math.max(7,Math.ceil(period.days)))),fortnight=chartDays(now,14);
 let rows=results.flatMap(r=>r.issues.map(i=>({...i,days:values(i,days),spark:values(i,fortnight)})));
 if(ask.onlyNew)rows=rows.filter(r=>r.isNew);
 rows.sort((a,b)=>b.events-a.events);
 const notes=results.filter(r=>r.note||r.error).map(r=>({source:r.id,text:r.error?r.name+': '+r.error:r.note,error:!!r.error}));
 // Nothing from anyone, but a source explained why (an unknown release, no tables): a question, not an empty card.
 if(!rows.length&&notes.length&&results.every(r=>!r.issues.length&&(r.note||r.error)))return kit.reply(s,command,{by:BY,question:true,text:notes.map(n=>n.text).join(' ')});
 const sources=results.map(r=>{const own=rows.filter(i=>i.source===r.id);
  return {id:r.id,name:r.name,color:r.color,issues:own.length,more:!!r.more&&!ask.onlyNew,events:own.reduce((n,i)=>n+i.events,0),users:own.reduce((n,i)=>n+i.users,0),fresh:own.filter(i=>i.isNew).length,
   url:r.url||'',scope:r.scope||'',note:r.note||'',error:r.error||'',canResolve:!!r.canResolve,crashFree:r.crashFree||null};});
 const totals={issues:rows.length,more:sources.some(x=>x.more),events:rows.reduce((n,r)=>n+r.events,0),users:rows.reduce((n,r)=>n+r.users,0),fresh:rows.filter(r=>r.isNew).length};
 // Stacked chart: the five most frequent issues and the rest, per day; and the same days split by source.
 const stack=rows.slice(0,STACK).map(r=>({id:r.source+':'+r.id,source:r.source,label:r.title,values:r.days}));
 const rest=days.map((_,i)=>rows.slice(STACK).reduce((n,r)=>n+r.days[i],0));
 if(rest.some(Boolean))stack.push({id:'rest',label:'остальные',values:rest});
 const bySource=sources.filter(x=>x.issues).map(x=>({id:x.id,label:x.name,color:x.color,values:days.map((_,i)=>rows.filter(r=>r.source===x.id).reduce((n,r)=>n+r.days[i],0))}));
 // The rows shown: the top overall, and with several sources each source's own top so none disappears.
 const shown=sources.length>1?sources.flatMap(x=>rows.filter(r=>r.source===x.id).slice(0,PER_SOURCE)):rows.slice(0,TOP);
 const issues=shown.map(({days,daily,...r})=>({...r,canResolve:!!sources.find(x=>x.id===r.source)?.canResolve}));
 if(rows.length>=3)s.requestProgress?.report('Ищу общее у частых крэшей');
 const line=await common(s,rows.slice(0,6));
 const text=summary({rows,totals,sources,label:period.label,release:rel?.name,platform:ask.platform,onlyNew:ask.onlyNew});
 const card={sources,period:{label:period.label,kind:period.kind,from:new Date(since).toISOString(),to:period.end||now.toISOString()},release:rel,platform:ask.platform,environment:ask.environment||'',onlyNew:ask.onlyNew,
  totals,chart:{days,series:stack,bySource,from:dayKey(period.calendar?since+DAY/2:since),to:period.calendar?dayKey(Date.parse(period.end)-DAY/2):dayKey(now.getTime())},issues,notes,common:line};
 return kit.reply(s,command,{by:BY,text,data:{crashCard:card},sources:sources.filter(x=>x.url).map(x=>({title:x.name+(x.scope?' · '+x.scope:''),url:x.url}))});
}

function setup(s){
 const ready=()=>{if(!kit.installed(s,ID))throw Error('Расширение «Крэши» не добавлено.');};
 return {ipc:{
  // The settings card: every crash source, whether its app is added and connected.
  sources:()=>registry(s).all(),
  // Called only from the card's «Решено» button and its «Отменить» toast.
  resolve:async(source,id)=>{ready();if(typeof source!=='string'||typeof id!=='string')throw Error('Некорректный крэш.');const r=await registry(s).resolve(source,id);return {source,id,status:'resolved',text:r?.text||'Отмечено решённым'};},
  reopen:async(source,id)=>{ready();if(typeof source!=='string'||typeof id!=='string')throw Error('Некорректный крэш.');const r=await registry(s).reopen(source,id);return {source,id,status:'unresolved',text:r?.text||'Снова открыто'};}
 }};
}

async function turn(s,command){
 const text=String(command||'');
 if(!kit.installed(s,ID))return null;
 const reg=registry(s);
 if(!query.about(text,{standalone:reg.standalone(text),named:reg.named(text).length>0}))return null;
 try{return await crashesTurn(s,text);}
 catch(e){return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+(e.message||'источник крэшей недоступен.')});}
}
// Dashboards (src/features/dashboards.cjs): read-only requests refresh there by themselves.
const dashboard={accepts:text=>query.about(String(text||'')),size:'w',widgets:[{title:'Крэши за неделю',command:'крэши за неделю'},{title:'Новые крэши',command:'новые крэши за неделю'}]};
module.exports={name:'crashes',dashboard,defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,crashesTurn,summary};
