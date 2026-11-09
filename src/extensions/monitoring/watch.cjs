// «Мониторинг», background watch: runs the due uptime checks and, every few minutes, reads all monitor sources;
// a service going down or coming back is told once (the foundation's `transitions`: two observations in a row
// confirm a change, a flapping service is told once and then held until it settles). Off until the user turns
// it on in the settings and has a check or a source. Notifications go to the notification center (one card per
// service, updated in place) and as a system notification through the notification policy (`deliver` = `notice` in
// feature.cjs: source `monitoring`, urgent when down) — see docs/foundations/monitoring.md.
const U=require('./uptime.cjs');
const {transitions}=require('../../features/monitor-sources.cjs');
const MIN=60000;

const fmtDuration=ms=>{const m=Math.max(1,Math.round(ms/MIN));return m<60?m+' мин':m<1440?Math.round(m/60)+' ч':Math.round(m/1440)+' дн';};
function noticeText(ev,service,info){
 if(ev.type==='down')return {title:'Сервис недоступен',text:'«'+service+'» не работает'+(info?.note?': '+info.note:'')+'.',kind:'attention'};
 if(ev.type==='recovered')return {title:'Сервис снова работает',text:'«'+service+'» снова отвечает'+(info?.downFor?' — лежал '+fmtDuration(info.downFor):'')+'.',kind:'success'};
 return {title:'Сервис мигает',text:'«'+service+'» то падает, то поднимается: '+ev.changes+' смены за 30 мин. Сообщу, когда состояние устоится.',kind:'attention'};
}

function create(s,{store,registry,now=()=>Date.now(),deliver=()=>{},request,certificate,confirm=2,flapLimit=4,flapWindow=30*MIN}={}){
 const tracker=transitions({now,confirm,flapLimit,flapWindow});
 tracker.restore(store.tracker());
 let busy=false,lastPoll=0;
 const enabled=()=>s.settings.extension_monitoring==='true'&&s.settings.monitoringWatch==='true';
 const pollMs=()=>Math.min(30,Math.max(1,Number(s.settings.monitoringPollMin)||2))*MIN;
 const downSince={};
 async function tick({force=false}={}){
  if(busy||!enabled())return {skipped:true};
  busy=true;
  try{
   const t=now();
   const probed=store.checks().length?await U.run(store,{now,request,certificate}):[];
   const sources=registry().list();
   if(!sources.length)return {probed:probed.length,events:[]};
   if(!force&&!probed.length&&t-lastPoll<pollMs())return {probed:0,events:[]};
   lastPoll=t;
   const snap=await registry().snapshot({now:t,from:t-15*MIN,to:t,light:true});
   store.logAlerts(snap.alerts);
   const events=[];
   // A service is observed only when at least one of its sources answered.
   const failed=new Set(snap.sources.filter(x=>x.error).map(x=>x.id));
   for(const svc of snap.services){
    if(svc.sources.length&&svc.sources.every(id=>failed.has(id)))continue;
    const ev=tracker.observe('service:'+svc.name,svc.status);
    if(svc.status==='critical'&&!downSince[svc.name])downSince[svc.name]=Date.parse(svc.since)||t;
    if(!ev)continue;
    const info={note:svc.note,downFor:ev.type==='recovered'&&downSince[svc.name]?t-downSince[svc.name]:0};
    if(ev.type==='recovered')delete downSince[svc.name];
    const n={id:'monitoring:'+svc.name,service:svc.name,type:ev.type,at:new Date(t).toISOString(),...noticeText(ev,svc.name,info),version:ev.type+':'+t};
    store.addNotice(n);events.push(n);
   }
   store.setTracker(tracker.state());store.save();
   for(const n of events)deliver(n);
   return {probed:probed.length,events};
  }finally{busy=false;}
 }
 return {tick,tracker,enabled};
}
module.exports={create,noticeText,fmtDuration};
