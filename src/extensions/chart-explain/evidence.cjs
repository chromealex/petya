// «Объясни график»: dated events that can explain a move, read from the apps the user connected (all read-only), and
// the ranking of candidate causes. Every item has a date and its source; nothing is inferred by a model.
//  releases  — successful release / deploy runs of «Сборки» (GitHub Actions, Unity Build Automation) and released
//              Jira versions with a release date («Патчноуты»);
//  incidents — outages and alerts in the period from the «monitor-source» registry («Мониторинг»);
//  crashes   — a day with crash events at least twice the median of the 7 days before (crash sources, «Крэши»);
//  campaigns — a UA campaign started, stopped or cut by half or more («Закупка трафика», ua-source);
//  holidays  — holidays.cjs for the game's countries.
const holidays=require('./holidays.cjs');
const DAY=86400000;
const key=t=>new Date(t).toISOString().slice(0,10);
const shift=(d,n)=>key(Date.parse(d+'T00:00:00Z')+n*DAY);
const lag=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/DAY);
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length?s.length%2?s[m]:(s[m-1]+s[m])/2:0;};
const added=(s,id)=>s.settings?.['extension_'+id]==='true';

async function releases(s,{from,to}){
 const items=[],errors=[];let checked=false;
 if(added(s,'ci-builds')){
  const src=require('../ci-builds/sources.cjs'),github=require('../github/client.cjs');
  const RELEASE=/release|deploy|publish|store|prod|выклад|релиз|upload|testflight|google ?play/i;
  if(github.connected(s.settings)){checked=true;
   try{for(const repo of (await github.repos(s)).slice(0,2))for(const r of await src.githubRuns(s,repo)){
    const day=String(r.at||'').slice(0,10);
    if(r.status==='success'&&day>=from&&day<=to&&(r.event==='release'||RELEASE.test(r.workflow)))items.push({kind:'release',date:day,at:r.at,title:'Релизная сборка «'+r.workflow+'»'+(r.branch?' ('+r.branch+')':''),detail:r.title,source:'GitHub Actions',url:r.url});
   }}catch(e){errors.push('GitHub Actions: '+e.message);}
  }
  if(src.unityConfigured(s.settings)){checked=true;
   try{for(const r of await src.unityRuns(s,{})){const day=String(r.at||'').slice(0,10);if(r.status==='success'&&day>=from&&day<=to)items.push({kind:'release',date:day,at:r.at,title:'Сборка Unity «'+r.workflow+'»'+(r.platform?' · '+r.platform:''),detail:r.title,source:'Unity Build Automation',url:r.url||''});}}
   catch(e){errors.push('Unity Build Automation: '+e.message);}
  }
 }
 if(added(s,'patch-notes')&&s.workspace?.api){checked=true;
  try{for(const v of await require('../patch-notes/sources.cjs').jiraVersions(s))if(v.released&&v.date>=from&&v.date<=to)items.push({kind:'release',date:v.date,title:'Вышла версия '+v.name,detail:'Jira, проект '+v.project,source:'Jira'});}
  catch(e){errors.push('Jira: '+e.message);}
 }
 return {kind:'releases',checked,items,errors};
}
async function incidents(s,{from,to,now}){
 let reg;try{reg=s.monitorSources||require('../../features/monitor-sources.cjs').create(s);}catch{return {kind:'incidents',checked:false,items:[],errors:[]};}
 const list=reg.list();if(!list.length)return {kind:'incidents',checked:false,items:[],errors:[]};
 const items=[],errors=[];
 for(const x of list){
  if(!x.has?.includes('history'))continue;
  try{for(const e of await reg.history(x.id,{from:Date.parse(from+'T00:00:00Z'),to:Math.min(now,Date.parse(to+'T00:00:00Z')+DAY),now}))
   items.push({kind:'incident',date:e.from.slice(0,10),at:e.from,until:e.to||null,title:(e.status==='critical'?'Инцидент':'Предупреждение')+(e.service?' «'+e.service+'»':'')+(e.title?': '+e.title:''),source:x.name,hours:e.to?Math.round((Date.parse(e.to)-Date.parse(e.from))/36e5*10)/10:null});}
  catch(err){errors.push(x.name+': '+err.message);}
 }
 return {kind:'incidents',checked:true,items,errors};
}
async function crashes(s,{from,to,now}){
 let feeds;try{feeds=require('../anomalies/feeds.cjs');}catch{return {kind:'crashes',checked:false,items:[],errors:[]};}
 if(!feeds.connected(s).includes('crashes'))return {kind:'crashes',checked:false,items:[],errors:[]};
 const r=await feeds.crashes(s,{to,now:new Date(now)});
 const items=[];
 for(const x of r.series){
  const pts=x.points;
  for(let i=7;i<pts.length;i++){
   const d=pts[i].date;if(d<from||d>to)continue;
   const base=median(pts.slice(i-7,i).map(p=>p.value));
   if(pts[i].value>=20&&pts[i].value>=2*Math.max(base,5))items.push({kind:'crash',date:d,title:'Всплеск крэшей: '+Math.round(pts[i].value)+' за день (обычно ≈'+Math.round(base)+')',source:x.sourceName});
  }
 }
 return {kind:'crashes',checked:true,items,errors:r.notes.filter(n=>n.error).map(n=>n.text)};
}
async function campaigns(s,{from,to,onset}){
 let reg;try{reg=s.uaSources||require('../../features/ua-sources.cjs').create(s);}catch{return {kind:'campaigns',checked:false,items:[],errors:[]};}
 if(!reg.list().length)return {kind:'campaigns',checked:false,items:[],errors:[]};
 const r=await reg.fetchAll({start:shift(onset,-10),end:to});
 const by=new Map();
 for(const row of r.rows){const k=row.network+'\u0000'+(row.campaignId||row.campaign);if(!by.has(k))by.set(k,{network:row.network,campaign:row.campaign,currency:row.currency,days:new Map()});const c=by.get(k);c.days.set(row.date,(c.days.get(row.date)||0)+row.spend);}
 const items=[];
 const money=(v,c)=>{try{return Number(v).toLocaleString('ru-RU',{style:'currency',currency:c,maximumFractionDigits:0});}catch{return Math.round(v)+' '+c;}};
 for(const c of by.values()){
  // The first day in [from, to] from which every day (up to 3) is at most half, or at least twice, the mean spend of the
  // 3 days before.
  for(let d=from;d<=to;d=shift(d,1)){
   const before=[1,2,3].map(n=>c.days.get(shift(d,-n))||0),after=[0,1,2].map(n=>c.days.get(shift(d,n))).filter(v=>v!==undefined);
   const b=before.reduce((a,v)=>a+v,0)/3,a=after.length?after.reduce((x,v)=>x+v,0)/after.length:null;
   if(a===null)continue;
   if(b>=10&&Math.max(...after)<=b*0.5){items.push({kind:'campaign',date:d,title:(a<b*0.05?'Остановлена кампания':'Урезана кампания')+' «'+c.campaign+'» ('+c.network+')',detail:'расход '+money(b,c.currency)+'/день → '+money(a,c.currency)+'/день',source:c.network});break;}
   if(a>=10&&Math.min(...after)>=Math.max(b,1)*2){items.push({kind:'campaign',date:d,title:(b<1?'Запущена кампания':'Расход вырос в кампании')+' «'+c.campaign+'» ('+c.network+')',detail:'расход '+money(b,c.currency)+'/день → '+money(a,c.currency)+'/день',source:c.network,up:true});break;}
  }
 }
 return {kind:'campaigns',checked:true,items,errors:r.failed.map(f=>f.name+': '+f.error)};
}
async function holidaysReader(s,{onset,date,countries}){
 const list=holidays.near(onset,1,countries);
 if(date!==onset)for(const h of holidays.near(date,1,countries))if(!list.some(x=>x.date===h.date&&x.name===h.name))list.push(h);
 return {kind:'holidays',checked:true,items:list.map(h=>({kind:'holiday',date:h.date,title:h.name,detail:h.country==='*'?'по всему миру':h.country,source:'Календарь праздников'})),errors:[]};
}
const READERS={releases,incidents,crashes,campaigns,holidays:holidaysReader};
const LABEL={releases:'релизы',incidents:'инциденты',crashes:'крэши',campaigns:'рекламные кампании',holidays:'праздники'};
const WEIGHT={incident:4,crash:3.5,release:3,campaign:3,holiday:1.5};

// Every reader at once; a failing reader is a note, never the answer's failure.
async function gather(s,{onset,date,countries=['RU','US'],now=Date.now()},readers=READERS){
 const ctx={from:shift(onset,-3),to:shift(date,1),onset,date,countries,now};
 const parts=await Promise.all(Object.entries(readers).map(([k,fn])=>Promise.resolve().then(()=>fn(s,ctx)).catch(e=>({kind:k,checked:true,items:[],errors:[e.message]}))));
 return {items:parts.flatMap(p=>p.items||[]),checked:parts.map(p=>({kind:p.kind,label:LABEL[p.kind]||p.kind,state:p.errors?.length&&!p.items?.length?'error':p.checked?'ok':'none',errors:p.errors||[]})),window:ctx};
}
// Candidate causes: close in time to the onset (before it or the same day; incidents and holidays may overlap it),
// ranked by kind and distance. A campaign that grew does not explain a drop, one that stopped does not explain a rise.
function rank(items,{onset,date,direction}){
 const out=[];
 for(const x of items){
  const d=lag(x.date,onset);   // days from the evidence to the onset (positive: before it)
  const overlaps=x.kind==='incident'&&x.until&&x.date<=date&&String(x.until).slice(0,10)>=onset;
  if(x.kind==='campaign'&&(direction==='down'&&x.up||direction==='up'&&!x.up))continue;
  if(x.kind==='holiday'?Math.abs(d)>1:x.kind==='incident'?!(overlaps||d>=-1&&d<=1):x.kind==='crash'?!(d>=-1&&d<=2):!(d>=0&&d<=3))continue;
  out.push({...x,lag:d,score:WEIGHT[x.kind]-Math.max(0,Math.abs(d)-(x.kind==='release'?1:0))*0.6});
 }
 return out.filter(x=>x.score>=1).sort((a,b)=>b.score-a.score||a.date.localeCompare(b.date)).slice(0,4);
}
module.exports={gather,rank,READERS,LABEL,releases,incidents,crashes,campaigns,shift,lag};
