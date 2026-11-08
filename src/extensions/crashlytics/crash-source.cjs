// Firebase Crashlytics as a crash source of «Крэши» (src/features/crash-sources.cjs), read from the Crashlytics
// BigQuery export (see client.cjs). Fatal events only (error_type FATAL): non-fatals and ANRs are not crashes here.
// Issues cannot be resolved: their state is not writable outside the Firebase console.
const bq=require('./client.cjs');
const DAY=86400000,LOOKBACK=28;
const NAMES=/(?:crashlytics|кр[аэе]шлитикс\p{L}*|firebase|файр[- ]?бейс\p{L}*|фаербейс\p{L}*)/iu;

// The tables a request reads: the chosen apps (or every Crashlytics table of the dataset), narrowed by platform.
async function scope(s,platform){
 const c=bq.config(s);
 let listed=null;
 const list=async()=>listed||(listed=await bq.tables(s));
 const batch=c.tables.length?c.tables:(await list()).batch;
 const tables=batch.filter(t=>!platform||t.endsWith(platform==='iOS'?'_IOS':'_ANDROID'));
 const realtime=c.realtime&&tables.length?(await list()).realtime.map(t=>t.replace(/_REALTIME$/,'')).filter(t=>tables.includes(t)):[];
 return {c,batch,tables,realtime};
}
// Query time window: the period, four weeks before it (to tell new issues), and 14 days for the chart.
function window(q,now){
 const end=new Date(Math.min(Date.parse(q.period?.end)||now.getTime(),now.getTime()));
 const start=new Date(Date.parse(q.period?.start)||end.getTime()-7*DAY);
 const today=Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),end.getUTCDate());
 const chart=new Date(today-13*DAY);
 const from=new Date(Math.min(start.getTime()-LOOKBACK*DAY,chart.getTime()));
 return {from:from.toISOString(),start:start.toISOString(),end:end.toISOString(),chart:chart.toISOString()};
}
function request(s,q,now){
 return scope(s,q.platform).then(({c,batch,tables,realtime})=>{
  if(!tables.length)return {c,batch,empty:true};
  const {sql,params}=bq.build({project:c.project,dataset:c.dataset,tables,realtime,release:!!q.release});
  const w=window(q,now);
  return {c,tables,sql,params:[...params,...bq.parameters({...w,...q.release?{version:q.release}:{}})],w};
 });
}
const consoleUrl=(project,row)=>row.bundle&&row.issue_id?'https://console.firebase.google.com/project/'+encodeURIComponent(project.replace(/^.*:/,''))+'/crashlytics/app/'+(row.platform==='IOS'?'ios':'android')+':'+encodeURIComponent(row.bundle)+'/issues/'+encodeURIComponent(row.issue_id):'';

module.exports={
 id:'crashlytics',name:'Firebase Crashlytics',color:'#e5ce8c',names:[NAMES],standalone:[/(?:crashlytics|кр[аэе]шлитикс\p{L}*)/iu],
 ready:settings=>bq.connected(settings),
 async issues(s,q){
  const now=q.now instanceof Date?q.now:new Date();
  const r=await request(s,q,now);
  if(r.empty)return {issues:[],note:r.batch.length?'':'В наборе данных BigQuery «'+r.c.dataset+'» нет таблиц Crashlytics. Включите выгрузку Crashlytics в BigQuery в настройках проекта Firebase.'};
  const {rows}=await bq.query(s,{sql:r.sql,params:r.params});
  const since=Number.isFinite(q.since)?q.since:Date.parse(r.w.start),covered=Date.parse(r.w.from)+DAY;
  const issues=rows.map(row=>{
   const first=Date.parse(row.first_seen);
   return {id:String(row.issue_id||''),title:row.title||'Крэш',culprit:row.culprit||row.subtitle||'',level:'fatal',events:row.events,users:row.users,
    firstSeen:first>covered?row.first_seen:null,lastSeen:row.last_seen,versions:row.versions||[],platform:row.platform==='IOS'?'iOS':'Android',
    project:row.bundle||row.app,url:consoleUrl(r.c.project,row),daily:(row.daily||[]).map(d=>({day:d.day,count:d.n})),isNew:first>covered&&first>=since};
  });
  return {issues,more:Number(rows[0]?.total)>rows.length,url:'https://console.firebase.google.com/project/'+encodeURIComponent(r.c.project.replace(/^.*:/,''))+'/crashlytics',
   scope:[...new Set(rows.map(x=>x.bundle).filter(Boolean))].slice(0,3).join(', ')||r.tables.slice(0,3).join(', ')};
 },
 // How many bytes the query for a period would read (BigQuery dry run, nothing billed): the settings check.
 async estimate(s,q={}){
  const now=q.now instanceof Date?q.now:new Date();
  const period=q.period||{start:new Date(now.getTime()-7*DAY).toISOString(),end:now.toISOString()};
  const r=await request(s,{...q,period},now);
  if(r.empty)return {tables:[],bytes:0,limit:r.c.limitBytes};
  const {bytes}=await bq.query(s,{sql:r.sql,params:r.params,dryRun:true});
  return {tables:r.tables,bytes,limit:r.c.limitBytes};
 },
 window,NAMES
};
