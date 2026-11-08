// What «Аномалии» watches: daily series read through the apps' own source registries — game metrics
// (metrics-source: DAU, installs, revenue, in total and per platform), crashes (crash-source: events per day from the
// issues' daily stats), player support (support-source: tickets created per day), ad revenue (ad-source: revenue per
// day, in total, per network and per platform) and store ratings (the «Отзывы в сторах» app: average rating and bad
// reviews per day). Every reader returns the same series shape and never throws: a failing source becomes a note.
//   Series = {key, kind, source, sourceName, metric, unit, segment: {key, value, label} | null, app?,
//             points: [{date: 'YYYY-MM-DD', value, volume?}], from: first date the source covers}
// A day without a point is missing data, never zero (zeros are written only where the source reports them or where
// a count of events is known to be complete for its window).
const {shift}=require('./stats.cjs');

const fill=(from,to)=>{const out=[];for(let d=from;d<=to;d=shift(d,1))out.push(d);return out;};
const day=iso=>{const t=Date.parse(iso);return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):'';};
const series=(o,map)=>({...o,points:[...map].filter(([d])=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort(([a],[b])=>a.localeCompare(b)).map(([date,v])=>typeof v==='object'?{date,...v}:{date,value:v})});
const PLATFORM={android:'Android',ios:'iOS'};

// --- Game metrics ----------------------------------------------------------------------------------------------------
async function metrics(s,{from,to}){
 const out=[],notes=[];
 let reg;try{reg=require('../metrics/sources.cjs');}catch{return {series:out,notes};}
 for(const x of reg.create(s).ready()){
  for(const platform of [null,'android','ios']){
   try{
    const answer=await x.source.fetch(s,{from,to,metrics:['dau','new','revenue'],platform,version:null,app:null});
    for(const row of reg.normalize(x.id,answer)){
     const dims=row.dimensions||{},country=dims.country?String(dims.country).toUpperCase():'';
     const segment=country?{key:'country',value:country,label:country}:platform?{key:'platform',value:platform,label:PLATFORM[platform]}:null;
     // A platform query that comes back without its platform is the total again: skip it.
     if(platform&&!segment)continue;
     out.push(series({key:'metrics:'+x.id+':'+row.metric+':'+(segment?segment.key+'='+segment.value:'all'),kind:'metrics',source:x.id,sourceName:x.name,metric:row.metric,unit:row.unit,segment,app:answer?.app||null,from},
      new Map(row.series.map(p=>[p.date,p.value]))));
    }
   }catch(e){if(!platform)notes.push({kind:'metrics',source:x.id,sourceName:x.name,text:x.name+': '+e.message,error:true});break;}
  }
 }
 return {series:out,notes};
}

// --- Crashes ---------------------------------------------------------------------------------------------------------
async function crashes(s,{to,now}){
 const out=[],notes=[];
 let reg;try{reg=s.crashSources||require('../../features/crash-sources.cjs').create(s);}catch{return {series:out,notes};}
 // Sources give 14 days of daily counts per issue: their sum per day is the crash events of the app.
 const start=new Date(Date.parse(to+'T00:00:00Z')-13*86400000);
 for(const x of reg.list()){
  try{
   const r=await reg.issues(x.id,{text:'',period:{label:'за 14 дней',start:start.toISOString(),end:now.toISOString(),days:14,statsPeriod:'14d',kind:'days'},since:start.getTime(),release:null,platform:null,environment:'',onlyNew:false,now});
   const days=fill(shift(to,-13),to),sum=new Map(days.map(d=>[d,0]));let seen=false;
   for(const i of r.issues)for(const d of i.daily){if(sum.has(d.day)){sum.set(d.day,sum.get(d.day)+d.count);seen=true;}}
   // Without any daily stats the source said nothing about days: no series rather than a row of zeros.
   if(!seen&&r.issues.some(i=>!i.daily.length)){notes.push({kind:'crashes',source:x.id,sourceName:x.name,text:x.name+' не даёт крэши по дням.'});continue;}
   out.push(series({key:'crashes:'+x.id+':events:all',kind:'crashes',source:x.id,sourceName:x.name,metric:'events',unit:'events',segment:null,from:days[0]},sum));
  }catch(e){notes.push({kind:'crashes',source:x.id,sourceName:x.name,text:x.name+': '+e.message,error:true});}
 }
 return {series:out,notes};
}

// --- Player support ----------------------------------------------------------------------------------------------------
async function support(s,{from,to}){
 const out=[],notes=[];
 let reg;try{reg=require('../support/sources.cjs').create(s);}catch{return {series:out,notes};}
 for(const x of reg.list()){
  try{
   const tickets=await x.source.tickets(s,{since:new Date(from+'T00:00:00Z')});
   const days=fill(from,to),count=new Map(days.map(d=>[d,0]));
   for(const t of tickets){const d=day(t.created);if(count.has(d))count.set(d,count.get(d)+1);}
   out.push(series({key:'support:'+x.id+':tickets:all',kind:'support',source:x.id,sourceName:x.name,metric:'tickets',unit:'tickets',segment:null,from},count));
  }catch(e){notes.push({kind:'support',source:x.id,sourceName:x.name,text:x.name+': '+e.message,error:true});}
 }
 return {series:out,notes};
}

// --- Ad revenue --------------------------------------------------------------------------------------------------------
async function ads(s,{from,to}){
 const out=[],notes=[];
 let reg;try{reg=require('../ad-revenue/sources.cjs').create(s);}catch{return {series:out,notes};}
 for(const x of reg.ready()){
  try{
   const max=x.source.maxDays||45,start=[from,shift(to,-(max-1))].sort().at(-1);
   const r=await x.source.fetch(s,{start,end:to,current:{start:shift(to,-6),end:to},check:()=>{}});
   const rows=(r?.rows||[]).filter(row=>row.day>=start&&row.day<=to&&Number.isFinite(row.revenue));
   if(!rows.length){notes.push({kind:'ads',source:x.id,sourceName:x.name,text:x.name+': нет данных о выручке за период.'});continue;}
   // Days the report has rows for; a day without rows is missing, not zero revenue.
   const present=new Set(rows.map(row=>row.day));
   const add=(segment,pick)=>{const sum=new Map([...present].map(d=>[d,0]));for(const row of rows)if(pick(row))sum.set(row.day,sum.get(row.day)+row.revenue);
    out.push(series({key:'ads:'+x.id+':revenue:'+(segment?segment.key+'='+segment.value:'all'),kind:'ads',source:x.id,sourceName:x.name,metric:'revenue',unit:'currency:USD',segment,from:start},new Map([...sum].map(([d,v])=>[d,Math.round(v*100)/100]))));};
   add(null,()=>true);
   const top=new Map();for(const row of rows)top.set(row.network,(top.get(row.network)||0)+row.revenue);
   for(const [network] of [...top].sort((a,b)=>b[1]-a[1]).slice(0,5))if(network)add({key:'network',value:network,label:network},row=>row.network===network);
   for(const p of ['android','ios'])if(rows.some(row=>row.platform===p))add({key:'platform',value:p,label:PLATFORM[p]},row=>row.platform===p);
  }catch(e){notes.push({kind:'ads',source:x.id,sourceName:x.name,text:x.name+': '+e.message,error:true});}
 }
 return {series:out,notes};
}

// --- Store ratings -------------------------------------------------------------------------------------------------------
const STORE={appstore:'App Store',play:'Google Play'};
async function reviews(s,{from,to}){
 const out=[],notes=[];
 let feature,stores;try{feature=require('../store-reviews/feature.cjs');stores=require('../store-reviews/stores.cjs');}catch{return {series:out,notes};}
 if(s.settings?.['extension_store-reviews']!=='true')return {series:out,notes};
 const c=feature.connected(s.settings);
 const apps=[];
 for(const store of ['appstore','play'].filter(x=>c[x])){try{apps.push(...await (store==='play'?stores.playApps(s):stores.ascApps(s)));}catch(e){notes.push({kind:'reviews',source:store,sourceName:STORE[store],text:STORE[store]+': '+e.message,error:true});}}
 const games=feature.games(apps).slice(0,3);
 for(const game of games)for(const store of ['appstore','play']){
  const app=game[store];if(!app)continue;
  try{
   const rows=store==='play'?await stores.playReviews(s,app.id):await stores.ascReviews(s,app.id,{since:new Date(from+'T00:00:00Z'),pages:10});
   const dated=rows.filter(r=>r.date&&r.rating>=1&&r.rating<=5);
   // Reviews are complete only from the oldest one read (Google Play keeps 7 days, App Store pages run out).
   const first=dated.length?dated.map(r=>day(r.date)).sort()[0]:to;
   const start=[from,first].sort().at(-1);
   const by=new Map(fill(start,to).map(d=>[d,{sum:0,n:0,bad:0}]));
   for(const r of dated){const b=by.get(day(r.date));if(b){b.sum+=r.rating;b.n++;if(r.rating<=2)b.bad++;}}
   const segment={key:'store',value:store,label:STORE[store]+(games.length>1?' · '+game.label:'')};
   const base={kind:'reviews',source:store,sourceName:STORE[store],unit:'stars',segment,app:game.label,from:start};
   out.push(series({...base,key:'reviews:'+store+':'+game.key+':rating',metric:'rating'},new Map([...by].filter(([,b])=>b.n).map(([d,b])=>[d,{value:Math.round(b.sum/b.n*100)/100,volume:b.n}]))));
   out.push(series({...base,key:'reviews:'+store+':'+game.key+':negative',metric:'negative',unit:'reviews'},new Map([...by].map(([d,b])=>[d,b.bad]))));
  }catch(e){notes.push({kind:'reviews',source:store,sourceName:STORE[store],text:STORE[store]+': '+e.message,error:true});}
 }
 return {series:out,notes};
}

const READERS={metrics,crashes,support,ads,reviews};
// Which kinds can be read now (a source connected and its app added), without reading anything. The registries check
// the source apps' switches; «Метрики игры» or «Крэши» themselves need not be added to be watched.
function connected(s){
 const out=[];
 const safe=fn=>{try{return !!fn();}catch{return false;}};
 if(safe(()=>require('../metrics/sources.cjs').create(s).ready().length))out.push('metrics');
 if(safe(()=>(s.crashSources||require('../../features/crash-sources.cjs').create(s)).list().length))out.push('crashes');
 if(safe(()=>require('../support/sources.cjs').create(s).list().length))out.push('support');
 if(safe(()=>require('../ad-revenue/sources.cjs').create(s).ready().length))out.push('ads');
 if(s.settings?.['extension_store-reviews']==='true'&&safe(()=>{const c=require('../store-reviews/feature.cjs').connected(s.settings);return c.play||c.appstore;}))out.push('reviews');
 return out;
}
// Reads every connected kind in parallel for days [from, to].
async function read(s,{from,to,now=new Date(),kinds=connected(s),readers=READERS}){
 const parts=await Promise.all(kinds.map(k=>readers[k]?readers[k](s,{from,to,now}).catch(e=>({series:[],notes:[{kind:k,source:k,sourceName:k,text:e.message,error:true}]})):{series:[],notes:[]}));
 return {series:parts.flatMap(p=>p.series),notes:parts.flatMap(p=>p.notes),kinds};
}
module.exports={read,connected,READERS,metrics,crashes,support,ads,reviews};
