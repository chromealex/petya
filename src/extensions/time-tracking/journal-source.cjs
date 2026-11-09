// «Учёт времени» as a journal source (journal-source registry, see docs/foundations/activity.md): the period's time
// by project (or by app when no project is known) from the activity tracker, one item per group at the moment it
// was first seen, with its minutes. Kind 'activity' — the journal shows it on the timeline without adding it to
// focus minutes. Nothing when the tracker is off.
const MIN=60000;
const dur=ms=>{const m=Math.round(ms/MIN),h=Math.floor(m/60);return h?h+' ч'+(m%60?' '+m%60+' мин':''):m+' мин';};
module.exports={
 id:'activity',name:'Учёт времени',icon:'time',
 ready:settings=>settings.activityTracking==='true',
 async collect(s,{from,to}){
  if(!s.activity)return {items:[]};
  const groups=new Map();
  for(const span of s.activity.spans({from,to})){
   const key=span.project||span.app;if(!key)continue;
   const g=groups.get(key)||{key,ms:0,first:span.start,apps:new Map(),project:!!span.project};
   g.ms+=span.end-span.start;g.first=Math.min(g.first,span.start);g.apps.set(span.app,(g.apps.get(span.app)||0)+span.end-span.start);groups.set(key,g);
  }
  const items=[...groups.values()].filter(g=>g.ms>=5*MIN).sort((a,b)=>b.ms-a.ms).slice(0,8).map(g=>({at:g.first,kind:'activity',icon:'time',minutes:Math.round(g.ms/MIN),
   title:g.key+' — '+dur(g.ms),detail:g.project?[...g.apps].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([app])=>app).join(', '):'приложение'}));
  return {items};
 }
};
