// Google Play (Android vitals) as a crash source of «Крэши» (src/features/crash-sources.cjs), through the Play
// Developer Reporting API with the Google Play connection (`googlePlayCredential`, scope playdeveloperreporting):
//   errorIssues:search (filter `errorIssueType = CRASH`) — crash clusters with cause, location, reports, users,
//     versions and the Play Console link for the period;
//   errorCountMetricSet:query (dimension issueId, filter `reportType = CRASH`) — daily reports per issue, for the
//     chart, the sparklines and «новый» (no report in the four weeks before the period);
//   crashRateMetricSet:query — crash rate of a versionCode, shown as crash-free users (1 − weighted crash rate).
// Only CRASH issues: ANR stays the Google Play ANR card's subject. Daily metrics use Google's
// America/Los_Angeles calendar days. A release filter needs a numeric versionCode; issues cannot be resolved here.
const {GooglePlay,metric,fmt}=require('../../google-play.cjs');
const DAY=86400000,LOOKBACK=28,MAX_APPS=5;
const NAMES=/(?:google\s?play|гугл[- ]?пле\p{L}*|play\s?console|плей\s?консол\p{L}*|android\s+vitals)/iu;

// The calendar day of a moment in Google Play's time zone, as a UTC midnight Date.
function laDay(at){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(at);
 const get=k=>Number(parts.find(p=>p.type===k).value);
 return new Date(Date.UTC(get('year'),get('month')-1,get('day')));
}
const client=s=>new GooglePlay({settings:()=>s.settings,request:s.request});
// The apps a request reads: one named by its title or package, otherwise all the connection sees (up to five).
async function apps(play,text){
 const list=await play.apps();
 const t=String(text||'').toLowerCase();
 const named=list.filter(a=>[a.label,a.packageName].some(n=>n&&n.length>2&&t.includes(n.toLowerCase())));
 const picked=(named.length?named:list).filter(a=>/^apps\/[a-zA-Z0-9._-]+$/.test(a.id));
 return {picked:picked.slice(0,MAX_APPS),more:picked.length>MAX_APPS,total:list.length};
}
function versionCode(release){
 if(!release)return {code:null};
 return /^\d{1,12}$/.test(release)?{code:release}:{error:'Google Play фильтрует по versionCode (число), а не по имени версии «'+release+'».'};
}
const dimension=(row,name)=>{const d=row?.dimensions?.find(x=>x.dimension===name);return d?String(d.stringValue??d.int64Value??''):'';};

async function appIssues(play,app,q,code,now){
 const latest=await play.freshness(app.id,'errorCountMetricSet');
 const start=new Date(q.period.start),end=new Date(Math.min(Date.parse(q.period.end)||now.getTime(),now.getTime()));
 const since=laDay(new Date(Number.isFinite(q.since)?q.since:start.getTime()));
 const look=new Date(laDay(start).getTime()-LOOKBACK*DAY);
 const until=latest?new Date(Math.min(latest.getTime(),laDay(end).getTime()+DAY)):null;
 const versionFilter=code?' AND versionCode = '+code:'';
 const daily=new Map();
 if(until&&until>look){
  const rows=await play.metricRows(app.id,'errorCountMetricSet',{start:look,end:until,dimensions:['issueId'],metrics:['errorReportCount','distinctUsers'],filter:'reportType = CRASH'+versionFilter});
  for(const row of rows){
   const id=dimension(row,'issueId'),n=metric(row,'errorReportCount');if(!id||!row.startTime||!n)continue;
   const list=daily.get(id)||[];list.push({day:fmt(row.startTime),count:n});daily.set(id,list);
  }
 }
 const found=await play.errorIssues(app.id,{start,end,filter:'errorIssueType = CRASH'+versionFilter});
 const issues=found.issues.filter(i=>!i.type||i.type==='CRASH').map(i=>{
  const id=String(i.name||'').split('/').pop();
  const days=(daily.get(id)||[]).sort((a,b)=>a.day.localeCompare(b.day));
  const first=days[0]?.day||null;
  const versions=[...new Set([i.firstAppVersion?.versionCode,i.lastAppVersion?.versionCode].filter(Boolean).map(String))];
  return {id,title:i.cause||'Крэш',culprit:i.location||'',level:'fatal',events:Number(i.errorReportCount)||0,users:Number(i.distinctUsers)||0,
   // First report within the four weeks Petya looked at; older issues count as seen before the period.
   firstSeen:first&&Date.parse(first)>look.getTime()?first+'T00:00:00Z':null,lastSeen:i.lastErrorReportTime||null,
   versions:versions.map(v=>'versionCode '+v),platform:'Android',project:app.label,url:i.issueUri||'',daily:days,
   isNew:!!first&&Date.parse(first)>look.getTime()&&Date.parse(first)>=since.getTime()};
 });
 return {issues,more:found.more,stale:!latest};
}

module.exports={
 id:'google-play',name:'Google Play',color:'#9dd9c9',names:[NAMES],service:'googleplay',
 ready:settings=>settings.module_googleplay!=='false'&&!!settings.googlePlayCredential,
 async issues(s,q){
  // Android only: an iOS question has nothing here.
  if(q.platform==='iOS')return {issues:[]};
  const {code,error}=versionCode(q.release);
  if(error)return {issues:[],note:error};
  const play=client(s),now=q.now instanceof Date?q.now:new Date();
  const {picked,more}=await apps(play,q.text);
  if(!picked.length)return {issues:[],note:'Google Play не видит ни одного приложения. Проверьте доступ сервисного аккаунта к отчётам.'};
  const out=[];let truncated=more,stale=[];
  for(const app of picked){const r=await appIssues(play,app,q,code,now);out.push(...r.issues);truncated=truncated||r.more;if(r.stale)stale.push(app.label);}
  return {issues:out,more:truncated,url:'https://play.google.com/console/',scope:picked.map(a=>a.label).join(', ')+(more?' и другие':''),
   note:stale.length?'Google Play пока не сообщает дневные данные для '+stale.join(', ')+'.':''};
 },
 // Crash-free users of a versionCode over the period: 1 − crash rate weighted by daily users.
 async crashFree(s,q){
  const {code}=versionCode(q.release);if(!code)return null;
  const play=client(s),now=q.now instanceof Date?q.now:new Date();
  const {picked}=await apps(play,q.text);
  let users=0,crashed=0;
  for(const app of picked){
   const latest=await play.freshness(app.id,'crashRateMetricSet');if(!latest)continue;
   const start=laDay(new Date(q.period.start)),end=new Date(Math.min(latest.getTime(),laDay(now).getTime()+DAY));
   if(end<=start)continue;
   for(const row of await play.metricRows(app.id,'crashRateMetricSet',{start,end,metrics:['crashRate','distinctUsers'],filter:'versionCode = '+code})){
    const rate=metric(row,'crashRate'),n=metric(row,'distinctUsers');if(rate===null||!n)continue;users+=n;crashed+=rate*n;
   }
  }
  return users?{sessions:null,users:Math.max(0,Math.min(1,1-crashed/users)),total:null}:null;
 },
 laDay,NAMES
};
