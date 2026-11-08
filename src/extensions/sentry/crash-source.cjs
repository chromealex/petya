// Sentry as a crash source of «Крэши» (src/features/crash-sources.cjs): unresolved issues of the chosen projects
// for a period with 14-day daily stats, exact release versions, release-health crash-free rates, and «Решено».
const sentry=require('./client.cjs');
const DAY=86400000;
const SENTRY=/(?:^|[^\p{L}\p{N}_])(?:sentry|сентри\p{L}{0,3})(?![\p{L}\p{N}_])/iu;
const number=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:0;};
const dayKey=ms=>new Date(ms).toISOString().slice(0,10);

// A configured project slug named in the request narrows the search to it («крэши game-ios»).
function project(text,slugs){
 const t=String(text||'').toLowerCase();
 return slugs.find(slug=>new RegExp('(?:^|[^\\p{L}\\p{N}_-])'+slug.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{N}_-])','u').test(t))||null;
}
// The projects a request reads: the named one, the chosen ones, or all the token sees.
async function scope(s,text){
 const c=sentry.config(s),all=await sentry.projects(s);
 const named=project(text,c.projects.length?c.projects:all.map(p=>p.slug));
 const chosen=named?[named]:c.projects;
 const picked=chosen.length?all.filter(p=>chosen.includes(p.slug)):all;
 return {c,picked,chosen,ids:picked.map(p=>p.id)};
}
const span=period=>period.statsPeriod?{statsPeriod:period.statsPeriod}:{start:period.start,end:period.end};

function issue(raw,since){
 const first=Date.parse(raw.firstSeen);
 const daily=(raw?.stats?.['14d']||[]).filter(([ts])=>Number.isFinite(ts)).map(([ts,n])=>({day:dayKey(ts*1000),count:number(n)}));
 return {id:String(raw.id),shortId:String(raw.shortId||''),title:String(raw.title||raw.metadata?.type||''),culprit:String(raw.culprit||''),level:String(raw.level||'error'),
  events:number(raw.count),users:number(raw.userCount),firstSeen:raw.firstSeen||null,lastSeen:raw.lastSeen||null,platform:String(raw.platform||raw.project?.platform||''),
  project:String(raw.project?.slug||''),url:/^https?:\/\//.test(raw.permalink||'')?raw.permalink:'',unhandled:!!raw.isUnhandled,daily,isNew:Number.isFinite(first)&&first>=since};
}

module.exports={
 id:'sentry',name:'Sentry',color:'#c9a8f0',names:[SENTRY],standalone:[SENTRY],
 ready:settings=>!!String(settings.sentryToken||'').trim()&&!!String(settings.sentryOrg||'').trim(),
 // Exact versions of a release: «1.4.2» finds «com.game@1.4.2+102», not «1.4.20».
 async release(s,name){
  const {ids}=await scope(s,'');
  const found=await sentry.releases(s,name,ids);
  if(!found.length)return null;
  const dates=found.map(r=>Date.parse(r.date)).filter(Number.isFinite);
  return {name,versions:found.map(r=>r.version).slice(0,10),date:dates.length?new Date(Math.min(...dates)).toISOString():null};
 },
 async issues(s,q){
  const {c,picked,chosen,ids}=await scope(s,q.text);
  if(!picked.length)return {issues:[],note:chosen.length?'В организации «'+c.org+'» нет проектов '+chosen.join(', ')+'. Выберите проекты в настройках «Sentry».':'В организации «'+c.org+'» нет доступных токену проектов Sentry (нужно право project:read).'};
  if(q.release&&!q.found)return {issues:[],note:'В Sentry нет релиза «'+q.release+'» в проектах '+picked.map(p=>p.slug).join(', ')+'.'};
  const search=['is:unresolved',c.query,q.platform?'os.name:'+q.platform:'',q.found?'release:['+q.found.versions.map(v=>JSON.stringify(v)).join(',')+']':''].filter(Boolean).join(' ');
  const environment=q.environment||c.environment;
  const raw=await sentry.issues(s,{projectIds:ids,query:search,environment,...span(q.period)});
  const since=Number.isFinite(q.since)?q.since:Date.now()-7*DAY;
  return {issues:raw.map(r=>issue(r,since)),more:raw.length>=100,url:sentry.issuesUrl(s,{projectIds:ids,query:search,environment,...span(q.period)}),
   scope:c.org+(picked.length<=3?' / '+picked.map(p=>p.slug).join(', '):' / '+picked.length+' проектов')};
 },
 // Release health for the asked release: null when the organization sends no sessions.
 async crashFree(s,q){
  if(!q.found)return null;
  const {ids}=await scope(s,q.text);
  return sentry.crashFree(s,{projectIds:ids,versions:q.found.versions,environment:q.environment||sentry.config(s).environment,...span(q.period)}).catch(()=>null);
 },
 async resolve(s,id){await sentry.setStatus(s,id,'resolved');return {id,status:'resolved',text:'Отмечено решённым в Sentry'};},
 async reopen(s,id){await sentry.setStatus(s,id,'unresolved');return {id,status:'unresolved',text:'Снова открыто в Sentry'};},
 project,SENTRY
};
