// «Крэши» as a release check of «Релизный чек-лист» (contract: src/extensions/release-checklist/checks.cjs): new
// crash issues in the release and its crash-free rate against the previous version, from every connected crash
// source (src/features/crash-sources.cjs). Read-only.
const crashSources=require('../../features/crash-sources.cjs');
const DAY=86400000;
// New issues below this many events are noise of a fresh release, not a reason to hold it.
const MIN_EVENTS=10;
// A drop of crash-free sessions by this much (0.5 percentage points) against the previous version is a problem.
const MAX_DROP=0.005;
let declared=null;
const list=()=>declared??=crashSources.load();
const pct=v=>(Math.round(v*1000)/10).toLocaleString('ru-RU')+'%';

module.exports={
 checks:[{id:'crashes.release',title:'Нет новых крэшей, crash-free не хуже прошлой версии',group:'Качество'}],
 ready:settings=>list().some(x=>(!x.setting||settings[x.setting]==='true')&&(()=>{try{return !!x.source.ready(settings);}catch{return false;}})()),
 hint:()=>'Подключите источник крэшей: Sentry, Firebase Crashlytics или Google Play.',
 async run(s,release){
  const reg=s.crashSources||crashSources.create(s),now=release.now||new Date();
  const evidence=[],problems=[],notes=[];let seen=false,fresh=0;
  for(const x of reg.list()){
   let rel=null,prev=null;
   try{rel=await reg.release(x.id,release.version);}catch{rel=null;}
   if(!rel){notes.push(x.name+': релиза '+release.version+' нет');continue;}
   seen=true;
   if(release.previous){try{prev=await reg.release(x.id,release.previous);}catch{prev=null;}}
   const since=Number.isFinite(Date.parse(rel.date))?Date.parse(rel.date):now.getTime()-14*DAY;
   const days=Math.max(1,Math.min(90,Math.ceil((now.getTime()-since)/DAY)));
   const period={label:'после релиза '+release.version,start:new Date(since).toISOString(),end:now.toISOString(),days,kind:'release'};
   const q={text:'',period,since,release:release.version,platform:null,environment:'',onlyNew:true,now,found:rel};
   try{
    const r=await reg.issues(x.id,q);
    const news=r.issues.filter(i=>i.isNew&&i.events>=MIN_EVENTS).sort((a,b)=>b.events-a.events);
    fresh+=news.length;
    if(news.length)problems.push(x.name+': новых крэшей — '+news.length);
    for(const i of news.slice(0,3))evidence.push({text:x.name+': «'+i.title+'» — '+i.events+' событий, '+i.users+' польз.',url:i.url});
   }catch(e){notes.push(x.name+': '+e.message);}
   try{
    const now1=await reg.crashFree(x.id,q);
    const before=prev?await reg.crashFree(x.id,{...q,release:release.previous,found:prev,period:{...period,start:prev.date||period.start}}):null;
    if(now1?.sessions!=null){
     evidence.push({text:x.name+': crash-free сессий '+pct(now1.sessions)+(before?.sessions!=null?' (в '+release.previous+' — '+pct(before.sessions)+')':'')});
     if(before?.sessions!=null&&now1.sessions<before.sessions-MAX_DROP)problems.push(x.name+': crash-free упал с '+pct(before.sessions)+' до '+pct(now1.sessions));
    }
   }catch{/* release health is optional */}
  }
  const action={label:'Крэши релиза',ask:'новые крэши после релиза '+release.version};
  if(!seen)return [{id:'crashes.release',status:'unknown',summary:(notes.join('; ')||'Источники крэшей не знают этот релиз')+'. Возможно, версия ещё не вышла.'}];
  if(problems.length)return [{id:'crashes.release',status:'problem',summary:problems.join('; ')+'.',evidence,action}];
  return [{id:'crashes.release',status:'ok',summary:fresh?'':'Новых заметных крэшей в '+release.version+' нет'+(notes.length?' ('+notes.join('; ')+')':'')+'.',evidence,action}];
 }
};
