// Activity tracker core: samples the frontmost app and window title every `interval` seconds and merges the samples
// into spans {app, title, start, end}. Everything takes an injected clock, sampler and idle reader, so it is tested
// on a fake clock (tests/activity.cjs); src/features/activity.cjs binds it to Electron and the company data folder.
// A sample at `t` claims [t, t + interval). The same app and title continue the open span while samples keep coming;
// a different window, a missed sample (sleep), idle input or the lock screen closes it. Idle time is cut off: the
// span ends where the input stopped (now − idle seconds). Titles are redacted before they are kept (redact.cjs).
const {redact}=require('./redact.cjs');
const {startOfDay,nextDay}=require('./store.cjs');
const MERGE_GAP=60000;

const number=(v,min,max,fallback)=>{const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:fallback;};
// The tracker's settings from Petya's settings object.
function options(settings={}){
 const until=Number(settings.activityPausedUntil)||0;
 return {enabled:settings.activityTracking==='true',interval:number(settings.activityInterval,5,300,15),idle:number(settings.activityIdle,60,3600,300),
  retention:number(settings.activityRetention,1,365,30),privateApps:String(settings.activityPrivateApps||''),pausedUntil:until};
}

function create({store,now=()=>Date.now(),sample,idleSeconds=()=>0,settings=()=>({}),classifiers=()=>[]}){
 let open=null,last=null,busy=false;
 // A span from a previous run (Petya was closed mid-span) is kept as it was last saved.
 {const saved=store.current.get();if(saved){store.add(saved);store.current.set(null);}}
 const cfg=()=>options(settings());
 const paused=(c,t)=>c.pausedUntil>t;
 function close(at){
  if(!open)return null;
  const span=open;open=null;
  if(Number.isFinite(at))span.end=Math.max(span.start,Math.min(span.end,at));
  if(span.end>span.start)store.add(span);
  store.current.set(null);
  return span;
 }
 function record(window,t,step){
  if(open&&open.app===window.app&&open.title===window.title&&(open.private||'')===(window.private||'')&&t<=open.end+step/2){open.end=t+step;}
  else{
   if(open)close(Math.min(open.end,t));
   open={app:window.app,title:window.title,start:t,end:t+step,...window.private?{private:window.private}:{}};
  }
  store.current.set(open);
 }
 // One sample. Returns what happened: 'off' | 'paused' | 'idle' | 'unknown' | 'busy' | 'sampled'.
 async function tick(){
  const c=cfg(),t=now();
  if(!c.enabled){close(t);return 'off';}
  if(paused(c,t)){close(t);return 'paused';}
  let idle=0;try{idle=Number(idleSeconds())||0;}catch{idle=0;}
  if(idle>=c.idle){close(t-idle*1000);last={at:t,state:'idle'};return 'idle';}
  if(busy)return 'busy';busy=true;
  let w=null;
  try{w=await sample();}catch{w=null;}
  finally{busy=false;}
  // The settings may have changed while the window was read (paused, switched off).
  const after=cfg();if(!after.enabled||paused(after,now())){close(now());return after.enabled?'paused':'off';}
  if(!w||!String(w.app||w.title||'').trim()){close(t);last={at:t,state:'unknown'};return 'unknown';}
  const safe=redact(w,{privateApps:c.privateApps});
  record(safe,t,c.interval*1000);
  last={at:t,state:'sampled',permission:w.permission!==false};
  return 'sampled';
 }

 // Classifier tags (activity-classifier registry): the first answer for each field wins.
 function tag(span){
  const out={...span};
  for(const x of classifiers()){
   let r=null;try{r=x.classify({app:span.app,title:span.title,private:span.private||''});}catch{r=null;}
   if(!r||typeof r!=='object')continue;
   for(const key of ['project','task','category','label'])if(!out[key]&&typeof r[key]==='string'&&r[key].trim())out[key]=r[key].trim().slice(0,120);
   if(r.url&&!out.url&&/^https:\/\//.test(r.url))out.url=String(r.url);
  }
  return out;
 }
 // Spans overlapping [from, to), clipped to it, the open one included (up to now), neighbours of the same window
 // less than a minute apart merged, then tagged by classifiers.
 function spans({from,to}={}){
  const t=now();const a=Number.isFinite(from)?from:startOfDay(t),b=Math.min(Number.isFinite(to)?to:nextDay(t),t);
  if(b<=a)return [];
  const rows=store.range(a,b);
  if(open&&open.end>a&&open.start<b)rows.push({...open,end:Math.min(open.end,t)});
  const merged=[];
  for(const s of rows.sort((x,y)=>x.start-y.start)){
   const start=Math.max(a,s.start),end=Math.min(b,s.end);if(end<=start)continue;
   const prev=merged.at(-1);
   if(prev&&prev.app===s.app&&prev.title===s.title&&(prev.private||'')===(s.private||'')&&start-prev.end<=MERGE_GAP){prev.end=Math.max(prev.end,end);continue;}
   if(prev&&start<prev.end){if(end<=prev.end)continue;merged.push({app:s.app,title:s.title,start:prev.end,end,...s.private?{private:s.private}:{}});continue;}
   merged.push({app:s.app,title:s.title,start,end,...s.private?{private:s.private}:{}});
  }
  return merged.map(tag);
 }
 const GROUPS={app:s=>s.app||'—',title:s=>s.title||s.app||'—',project:s=>s.project||'',task:s=>s.task||'',category:s=>s.category||'',
  day:s=>{const d=new Date(s.start);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');},
  hour:s=>String(new Date(s.start).getHours()).padStart(2,'0')};
 // Time per group over [from, to): {total, groups:[{key, ms, spans, apps}]}, largest first. `groupBy` is one of
 // GROUPS or a function span → key ('' = not counted in a group, still in the total). Day and hour split spans.
 function summary(range={},groupBy='app'){
  const key=typeof groupBy==='function'?groupBy:GROUPS[groupBy];
  if(!key)throw Error('Неизвестная группировка: '+groupBy);
  let rows=spans(range);
  if(groupBy==='day'||groupBy==='hour'){
   const step=groupBy==='day'?s=>nextDay(s):s=>{const d=new Date(s);d.setMinutes(60,0,0);return d.getTime();};
   rows=rows.flatMap(s=>{const out=[];let x=s.start;while(x<s.end){const y=Math.min(s.end,step(x));out.push({...s,start:x,end:y});x=y;}return out;});
  }
  const groups=new Map();let total=0;
  for(const s of rows){
   const ms=s.end-s.start;total+=ms;
   const k=String(key(s)||'');if(!k)continue;
   const g=groups.get(k)||{key:k,ms:0,spans:0,apps:new Map()};g.ms+=ms;g.spans++;g.apps.set(s.app,(g.apps.get(s.app)||0)+ms);groups.set(k,g);
  }
  return {total,groups:[...groups.values()].map(g=>({key:g.key,ms:g.ms,spans:g.spans,apps:[...g.apps].sort((x,y)=>y[1]-x[1]).slice(0,3).map(([app,ms])=>({app,ms}))})).sort((x,y)=>y.ms-x.ms)};
 }
 const status=()=>{const c=cfg(),t=now();return {enabled:c.enabled,paused:paused(c,t),pausedUntil:paused(c,t)?c.pausedUntil:0,interval:c.interval,idle:c.idle,retention:c.retention,
  current:open?{app:open.app,title:open.title,since:open.start,private:open.private||''}:null,last};};
 return {tick,close:at=>close(Number.isFinite(at)?at:now()),spans,summary,status,prune:()=>store.prune(cfg().retention,now()),
  wipe(){open=null;last=null;store.wipe();}};
}
module.exports={create,options,MERGE_GAP};
