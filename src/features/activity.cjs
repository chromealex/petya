// Activity tracker (a foundation for apps such as «Учёт времени»): which app and window were in front, as spans
// {app, title, start, end, project?, task?, category?}. Opt-in (off by default), local only, pausable and wiped on
// request; nothing is sent anywhere. Contract for apps: docs/foundations/activity.md.
// - Settings: activityTracking ('false'), activityInterval (15 s), activityIdle (300 s), activityRetention (30 days),
//   activityPrivateApps (apps / title words whose titles are never stored), activityPausedUntil (ms, '' = running).
// - Services: `s.activity` {spans(range), summary(range, groupBy), status(), enable(on), pause(minutes), resume(),
//   wipe(), classifiers()}. IPC: window.petya.feature('activity', 'status' | 'pause' | 'resume' | 'wipe' | 'enable').
// - Classifiers: an app declares `"provides": {"activity-classifier": "<file>.cjs"}`; the file exports
//   {id, name?, order?, classify({app, title, private}, settings) -> {project?, task?, category?, label?, url?} | null}. Tags are applied
//   when spans are read, never stored, so a new classifier applies to past days too.
// Storage: `<company data>/activity/` (src/activity/store.cjs). Sampling: src/activity/foreground.cjs.
const path=require('node:path');
const tracker=require('../activity/tracker.cjs');
const KIND='activity-classifier';

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  if(typeof p.classify!=='function'||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{1,40}$/.test(p.id))throw Error('Invalid activity classifier '+x.extension+'/'+x.file);
  return {id:p.id,extension:x.extension,setting:x.setting,name:p.name||x.name,order:Number.isFinite(p.order)?p.order:1000,classify:p.classify};
 }).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
}

function validate(next){
 const num=(key,min,max,label)=>{if(next[key]===undefined||next[key]==='')return;const n=Number(next[key]);if(!Number.isInteger(n)||n<min||n>max)throw Error(label+': от '+min+' до '+max+'.');next[key]=String(n);};
 if(next.activityTracking!==undefined&&!['true','false'].includes(next.activityTracking))throw Error('Некорректная настройка activityTracking');
 num('activityInterval',5,300,'Интервал учёта активности, секунд');
 num('activityIdle',60,3600,'Простой, после которого учёт активности останавливается, секунд');
 num('activityRetention',1,365,'Сколько дней хранить историю активности');
 if(next.activityPausedUntil&&!/^\d{0,15}$/.test(next.activityPausedUntil))throw Error('Некорректная настройка activityPausedUntil');
 if(typeof next.activityPrivateApps==='string')next.activityPrivateApps=next.activityPrivateApps.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean).slice(0,100).join('\n').slice(0,2000);
}

// The tracker bound to live services. `deps` replaces the clock, sampler, idle reader and classifiers in tests.
function create(s,{now=()=>Date.now(),sample,idleSeconds,classifiers,dir}={}){
 const registry=classifiers||(()=>{let list=null;return ()=>{if(!list){try{list=load();}catch(e){console.error('Activity classifiers:',e.message);list=[];}}return list.filter(x=>!x.setting||s.settings?.[x.setting]==='true').map(x=>({...x,classify:w=>x.classify(w,s.settings||{})}));};})();
 const where=dir||(()=>s.dataRoot?path.join(s.dataRoot,'activity'):'');
 let root=where();
 const store=require('../activity/store.cjs').create({dir:()=>root});
 const core=tracker.create({store,now,sample,idleSeconds:idleSeconds||(()=>0),settings:()=>s.settings||{},classifiers:registry});
 const save=values=>s.saveSettings?.(values);
 const api={
  spans:range=>core.spans(range||{}),
  summary:(range,groupBy='app')=>core.summary(range||{},groupBy),
  status:()=>({...core.status(),supported:api.supported,folder:root,bytes:store.size(),days:store.days().length,classifiers:registry().map(x=>({id:x.id,name:x.name}))}),
  supported:true,
  enable(on=true){save({activityTracking:on?'true':'false',activityPausedUntil:''});if(!on)core.close();return api.status();},
  pause(minutes){const m=Number(minutes);const until=Number.isFinite(m)&&m>0?now()+Math.min(m,24*60)*60000:now()+365*86400000;save({activityPausedUntil:String(until)});core.close();return api.status();},
  resume(){save({activityPausedUntil:''});return api.status();},
  wipe(){core.wipe();return api.status();},
  prune:()=>core.prune(),
  classifiers:()=>registry().map(x=>({id:x.id,name:x.name})),
  // The company changed: the open span belongs to the previous company's folder.
  tick(){const next=where();if(next!==root){core.close();root=next;}return core.tick();},
  close:at=>core.close(at)
 };
 return api;
}

function setup(s){
 const electron=(()=>{try{return require('electron');}catch{return null;}})();
 const reader=require('../activity/foreground.cjs').create();
 const power=electron?.powerMonitor;
 const activity=create(s,{sample:()=>reader.read(),idleSeconds:()=>{try{return power?.getSystemIdleTime?.()||0;}catch{return 0;}}});
 activity.supported=reader.supported;
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){
  // A self-adjusting timer: the interval is read from the settings before every sample.
  const loop=()=>{const t=setTimeout(async()=>{try{await activity.tick();}catch(e){console.error('Activity sample:',e.message);}loop();},tracker.options(s.settings).interval*1000);t.unref?.();};
  loop();
  const daily=setInterval(()=>{try{activity.prune();}catch{/* next day */}},6*3600000);daily.unref?.();
  try{activity.prune();}catch{/* no folder yet */}
  for(const event of ['lock-screen','suspend','shutdown'])power?.on?.(event,()=>activity.close());
  electron?.app?.on?.('will-quit',()=>{activity.close();reader.stop();});
 }
 return {activity,ipc:{status:()=>activity.status(),enable:on=>activity.enable(on!==false),pause:minutes=>activity.pause(minutes),resume:()=>activity.resume(),wipe:()=>activity.wipe()}};
}

module.exports={name:'activity',defaults:{activityTracking:'false',activityInterval:'15',activityIdle:'300',activityRetention:'30',activityPrivateApps:'',activityPausedUntil:''},
 validate,setup,create,load,KIND};
