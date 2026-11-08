// Notification policy: one place deciding, for every system notification Petya shows, whether it is delivered
// now, held (kept by the policy that held it and shown when its condition ends) or summarized (no system popup,
// collected into one quiet item in the notification center). Petya itself knows no condition; policies come
// from extensions (focus sessions, quiet hours, meetings in progress, per-source mute rules). Contract for other
// apps: docs/foundations/notifications-policy.md. An extension declares in its extension.json
//   "provides": { "notification-policy": "<file>.cjs" }
// and the file exports
//   { id?, label?, order?,                              // order: lower wins a tie (default 1000)
//     ready?(settings) -> bool,                         // the registry adds «the extension is added»
//     decide(services, notification) -> null | {action:'deliver'|'hold'|'summarize', reason?},   // synchronous
//     accept?(services, notification) }                 // required to hold: the policy keeps it and releases it
// notification: {title, body, source, urgency, urgent, at}. `source` names who sent it ('petya' when unknown,
// 'assignments' for smart notifications about assignments); `urgent` is computed here once, the same for every
// policy (a decision needed, an error, a meeting about to start, a reminder, or marked by its sender).
// The strongest decision wins: hold > summarize > deliver; a policy that throws or cannot accept is ignored, so a
// notification is never lost — the worst case is that it is shown.
// Every system notification Petya shows is an Electron `Notification`, so one wrapper around
// `Notification.prototype.show` routes them all here; nothing in the application shell changes, and the
// «smart notifications» switch keeps deciding what is sent at all — the policy decides only when.
const KIND='notification-policy';
const ACTIONS={deliver:1,summarize:2,hold:3};
const URGENT=/нужн\p{L}*\s+(?:ваш\p{L}*\s+)?(?:решени|ответ|внимани|уточн)|требу\p{L}*|ошибк|не\s+удалось|не\s+получилось|сбой|упал|упала|срочн|уточни|ответьте|подтверд|ждёт\s+ответа|ждет\s+ответа|вопрос|встреч\p{L}*\s+(?:через|начина)|через\s+\d+\s+мин\p{L}*\s+встреч|напомина|напоминание/iu;
const SUMMARY='notification-summary',KEEP=50;

// Whether a notification must pass whatever the policies say. Marked by its sender (`petyaUrgent`, or
// `petyaFocus` — the focus app's own notifications), critical, or urgent by its words.
function urgent(n){
 if(n?.petyaUrgent||n?.petyaFocus)return true;
 if(String(n?.urgency||'')==='critical')return true;
 return URGENT.test(String(n?.title||'')+' '+String(n?.body||''));
}

// Who is sending: a caller wraps its notify call in `tag({source}, fn)`; the notification created and shown
// synchronously inside carries that source. A notification may also carry `petyaSource` itself.
let pending=null;
function tag(meta,fn){const previous=pending;pending=meta&&typeof meta==='object'?meta:null;try{return fn();}finally{pending=previous;}}

// One wrapper around Notification.prototype.show, installed once per process; `gate(notification)` returns true
// to keep it from showing. Installing again replaces the gate. Returns whether the wrapper is active.
function install(electron,gate){
 const N=electron?.Notification;
 if(!N?.prototype||typeof N.prototype.show!=='function')return false;
 if(N.prototype.show.petyaNotificationGate){N.prototype.show.petyaNotificationGate.gate=gate;return true;}
 const original=N.prototype.show;
 const state={gate};
 const show=function(...args){
  if(pending&&!this.petyaSource&&pending.source)try{this.petyaSource=String(pending.source);}catch{/* frozen */}
  let hold=false;try{hold=!!state.gate(this);}catch{hold=false;}
  if(hold)return undefined;
  return original.apply(this,args);
 };
 show.petyaNotificationGate=state;
 try{N.prototype.show=show;}catch{return false;}
 return N.prototype.show===show;
}

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  const bad=()=>Error('Invalid notification policy '+x.extension+'/'+x.file);
  if(typeof p.decide!=='function')throw bad();
  for(const hook of ['ready','accept'])if(p[hook]!==undefined&&typeof p[hook]!=='function')throw bad();
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,label:p.label||x.name,order:Number.isFinite(p.order)?p.order:1000,provider:p};
 }).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
}

const text=(v,max)=>String(v??'').slice(0,max);
// What a policy sees of a notification (never the Electron object itself).
function describe(n,now=Date.now()){
 return {title:text(n?.title,120),body:text(n?.body,250),source:text(n?.petyaSource||n?.source||'petya',40),urgency:text(n?.urgency,20),urgent:urgent(n),at:now};
}

function create(s,{policies=load(),now=Date.now,send}={}){
 const added=p=>!p.setting||s.settings?.[p.setting]==='true';
 const ready=p=>{try{return added(p)&&(typeof p.provider.ready!=='function'||!!p.provider.ready(s.settings||{}));}catch{return false;}};
 const publish=send||(item=>{try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',item);}catch{/* window closing */}});
 const summarized=[];
 // The decision for one notification: {action, policy, reason}. Pure: nothing is kept here.
 function decide(n){
  const info=n&&typeof n.urgent==='boolean'&&typeof n.at==='number'?n:describe(n,now());
  let best={action:'deliver',policy:null,reason:''};
  for(const p of policies){
   if(!ready(p))continue;
   let d=null;try{d=p.provider.decide(s,{...info});}catch{d=null;}
   if(!d||!ACTIONS[d.action])continue;
   if(d.action==='hold'&&typeof p.provider.accept!=='function')continue;
   if(ACTIONS[d.action]>ACTIONS[best.action])best={action:d.action,policy:p.id,reason:text(d.reason,120)};
  }
  return {...best,notification:info};
 }
 function summaryItem(){
  const list=summarized.slice(-4).map(n=>n.body||n.title);
  return {id:SUMMARY,title:'Тихие уведомления',text:summarized.length+' · '+list.join(' · '),busy:false,version:'summary:'+summarized.length+':'+(summarized.at(-1)?.at||0),kind:'info'};
 }
 // Gate for the Notification wrapper: true when the system notification is not shown now.
 function route(n){
  const d=decide(n);
  if(d.action==='hold'){
   const p=policies.find(x=>x.id===d.policy);
   try{p.provider.accept(s,{...d.notification});return true;}catch{return false;}
  }
  if(d.action==='summarize'){
   summarized.push({...d.notification,policy:d.policy,reason:d.reason});
   if(summarized.length>KEEP)summarized.splice(0,summarized.length-KEEP);
   publish(summaryItem());
   return true;
  }
  return false;
 }
 return {decide,route,
  summary:()=>summarized.map(n=>({...n})),
  clear(){summarized.splice(0);},
  policies:()=>policies.map(p=>({id:p.id,extension:p.extension,label:p.label,ready:ready(p)}))};
}

let bound=null;
module.exports={name:'notificationPolicy',defaults:{},validate(){},KIND,URGENT,urgent,tag,install,load,describe,create,
 setup(s){
  bound=create(s);
  const electron=(()=>{try{return require('electron');}catch{return null;}})();
  install(electron,n=>bound.route(n));
  return {notificationPolicy:bound,ipc:{status:()=>({policies:bound.policies(),summarized:bound.summary()}),clear:()=>{bound.clear();return true;}}};
 }};
