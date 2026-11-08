// Ad revenue numbers computed by code from the sources' rows: totals with the change against the previous period,
// revenue by day stacked by network, format × network, countries, eCPM per day and per network, fill rate where a
// source reports it, ARPDAU where a source reports daily active users, and anomalies against a 4-week baseline
// (the same weekday in the four weeks before). Nothing here is estimated by a model.
const {DAY,iso}=require('./query.cjs');
const STACK=5;
const FORMAT_ORDER=['rewarded','interstitial','banner','mrec','native','appopen','rewarded_interstitial','offerwall'];

const sum=(rows,key)=>rows.reduce((n,r)=>n+(Number(r[key])||0),0);
const round=(v,d=2)=>Math.round(v*10**d)/10**d;
const ecpm=(revenue,impressions)=>impressions>0?round(revenue/impressions*1000,3):null;
const change=(now,before)=>before>0?round((now-before)/before,4):null;
function daysBetween(start,end){const out=[];for(let t=Date.parse(start+'T00:00:00Z');t<=Date.parse(end+'T00:00:00Z');t+=DAY)out.push(iso(t));return out;}
const shift=(day,n)=>iso(Date.parse(day+'T00:00:00Z')+n*DAY);
const norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,'');

// Apps named in the request: «выручка Bunker Wars вчера».
function namedApps(rows,text){
 const t=norm(text);
 return [...new Set(rows.map(r=>r.app).filter(a=>norm(a).length>=3&&t.includes(norm(a))))];
}
function filter(rows,ask,apps){
 return rows.filter(r=>(!ask.format||r.format===ask.format)&&(!ask.network||r.network===ask.network)&&(!ask.platform||r.platform===ask.platform)&&(!apps.length||apps.includes(r.app)));
}
function group(rows,key){
 const m=new Map();
 for(const r of rows){const k=typeof key==='function'?key(r):r[key];const g=m.get(k)||{key:k,revenue:0,impressions:0,attempts:0,responses:0,hasFill:false};
  g.revenue+=r.revenue;g.impressions+=r.impressions;if(r.attempts!=null&&r.responses!=null){g.attempts+=r.attempts;g.responses+=r.responses;g.hasFill=true;}m.set(k,g);}
 return m;
}
const fill=g=>g.hasFill&&g.attempts>0?round(g.responses/g.attempts,4):null;

// Anomalies: a day of the period whose revenue differs from the mean of the same weekday in the 4 weeks before.
function anomalies(rows,days,{dimension,label,min,threshold}){
 const out=[];
 const byDay=group(rows,'day');
 for(const d of days){
  const base=[7,14,21,28].map(n=>byDay.get(shift(d,-n))?.revenue).filter(v=>v!==undefined);
  if(base.length<2)continue;
  const mean=base.reduce((a,b)=>a+b,0)/base.length,v=byDay.get(d)?.revenue||0;
  if(mean<min)continue;
  const dev=(v-mean)/mean;
  if(Math.abs(dev)>=threshold)out.push({day:d,dimension,label,revenue:round(v),baseline:round(mean),change:round(dev,4),weeks:base.length});
 }
 return out;
}

function analyse({rows,days:daily=[],countries=[]},ask,{text='',now=new Date()}={}){
 const p=ask.period;
 const apps=namedApps(rows,text);
 const scoped=filter(rows,ask,apps);
 const periodDays=daysBetween(p.start,p.end);
 const prevDays=daysBetween(shift(p.start,-p.days),shift(p.start,-1));
 const inPeriod=scoped.filter(r=>r.day>=p.start&&r.day<=p.end),inPrev=scoped.filter(r=>prevDays.includes(r.day));
 const revenue=sum(inPeriod,'revenue'),impressions=sum(inPeriod,'impressions');
 const prevRevenue=sum(inPrev,'revenue'),prevImpressions=sum(inPrev,'impressions');
 const covered=new Set(scoped.map(r=>r.day));
 const totals={revenue:round(revenue),impressions,ecpm:ecpm(revenue,impressions),
  previous:prevDays.every(d=>covered.has(d))||inPrev.length?{revenue:round(prevRevenue),impressions:prevImpressions,ecpm:ecpm(prevRevenue,prevImpressions),from:prevDays[0],to:prevDays.at(-1)}:null};
 totals.change=totals.previous?change(revenue,prevRevenue):null;
 totals.ecpmChange=totals.previous&&totals.ecpm!=null&&totals.previous.ecpm?change(totals.ecpm,totals.previous.ecpm):null;
 totals.impressionsChange=totals.previous?change(impressions,prevImpressions):null;
 // One day is compared with the same weekday of the four weeks before, not with the day before.
 if(p.days===1){const byDay=group(scoped,'day');const base=[7,14,21,28].map(n=>byDay.get(shift(p.start,-n))?.revenue).filter(v=>v!==undefined);
  totals.weekday=base.length>=2?{baseline:round(base.reduce((a,b)=>a+b,0)/base.length),change:change(revenue,base.reduce((a,b)=>a+b,0)/base.length),weeks:base.length}:null;}
 // Fill rate: mediation-level when a source reports requests and fills (LevelPlay), else per network (AppLovin).
 const dailyScoped=daily.filter(d=>(!ask.platform||d.platform===ask.platform)&&(!apps.length||apps.includes(d.app)));
 const dailyIn=dailyScoped.filter(d=>d.day>=p.start&&d.day<=p.end);
 const requests=sum(dailyIn,'requests'),fills=sum(dailyIn,'fills');
 totals.fill=!ask.network&&!ask.format&&requests>0?round(fills/requests,4):null;
 // ARPDAU: revenue of the apps that report DAU, per active user per day.
 const dau=sum(dailyIn,'dau');
 if(dau>0&&!ask.network&&!ask.format){const withDau=new Set(dailyIn.filter(d=>d.dau>0).map(d=>d.app+'\n'+d.platform+'\n'+d.day));
  const rev=inPeriod.filter(r=>withDau.has(r.app+'\n'+r.platform+'\n'+r.day)).reduce((n,r)=>n+r.revenue,0);totals.arpdau=round(rev/dau,4);totals.dau=Math.round(dau/periodDays.length);}
 else totals.arpdau=null;

 // Chart: at least 14 days so one day is seen against its neighbours; days outside the period are dimmed.
 const chartDays=daysBetween(shift(p.end,-(Math.max(14,p.days)-1)),p.end);
 const networks=[...group(inPeriod,'network').values()].sort((a,b)=>b.revenue-a.revenue);
 const top=networks.slice(0,STACK).map(g=>g.key);
 const chartRows=scoped.filter(r=>r.day>=chartDays[0]&&r.day<=chartDays.at(-1));
 const byNetDay=group(chartRows,r=>r.network+'\n'+r.day),byDay=group(chartRows,'day');
 const series=top.map(n=>({id:n,label:n,values:chartDays.map(d=>round(byNetDay.get(n+'\n'+d)?.revenue||0))}));
 const rest=chartDays.map(d=>round((byDay.get(d)?.revenue||0)-top.reduce((s,n)=>s+(byNetDay.get(n+'\n'+d)?.revenue||0),0)));
 if(rest.some(v=>v>0.005))series.push({id:'rest',label:'остальные',values:rest.map(v=>Math.max(0,v))});
 const ecpmByDay=chartDays.map(d=>{const g=byDay.get(d);return g?ecpm(g.revenue,g.impressions):null;});

 // Networks and formats with share, eCPM, change against the previous period and eCPM per chart day.
 const prevNet=group(inPrev,'network'),prevFmt=group(inPrev,'format');
 const netRows=networks.map(g=>({name:g.key,revenue:round(g.revenue),impressions:g.impressions,share:revenue>0?round(g.revenue/revenue,4):0,ecpm:ecpm(g.revenue,g.impressions),fill:fill(g),
  change:totals.previous?change(g.revenue,prevNet.get(g.key)?.revenue||0):null,ecpmTrend:chartDays.map(d=>{const x=byNetDay.get(g.key+'\n'+d);return x?ecpm(x.revenue,x.impressions):null;})}));
 const formats=[...group(inPeriod,'format').values()].sort((a,b)=>b.revenue-a.revenue).map(g=>({format:g.key,revenue:round(g.revenue),impressions:g.impressions,share:revenue>0?round(g.revenue/revenue,4):0,ecpm:ecpm(g.revenue,g.impressions),
  change:totals.previous?change(g.revenue,prevFmt.get(g.key)?.revenue||0):null}));
 // Format × network: revenue and eCPM in each cell; networks beyond the top five go to «остальные».
 const cellMap=group(inPeriod,r=>r.format+'\n'+(top.includes(r.network)?r.network:'rest'));
 const matrix={formats:formats.map(f=>f.format).sort((a,b)=>(FORMAT_ORDER.indexOf(a)+1||99)-(FORMAT_ORDER.indexOf(b)+1||99)),networks:[...top,...networks.length>STACK?['rest']:[]],
  cells:[...cellMap.values()].map(g=>{const [format,network]=g.key.split('\n');return {format,network,revenue:round(g.revenue),ecpm:ecpm(g.revenue,g.impressions)};})};

 // Countries: only when the request is not narrowed by format, network or platform (the country report is not).
 const countryTotal=sum(countries,'revenue');
 const narrowed=!!(ask.format||ask.network||ask.platform||apps.length);
 const geo=narrowed?[]:countries.reduce((m,c)=>{const g=m.find(x=>x.country===c.country);if(g){g.revenue+=c.revenue;g.impressions+=c.impressions;}else m.push({...c});return m;},[])
  .sort((a,b)=>b.revenue-a.revenue).slice(0,8).map(c=>({country:c.country,revenue:round(c.revenue),impressions:c.impressions,share:countryTotal>0?round(c.revenue/countryTotal,4):0,ecpm:ecpm(c.revenue,c.impressions)}));

 // Anomalies over the last (up to) 7 days of the period: total, each format and the top networks.
 const recent=periodDays.slice(-7);
 const dayMin=Math.max(5,revenue/periodDays.length*0.02);
 const found=[...anomalies(scoped,recent,{dimension:ask.format?'format':ask.network?'network':'total',label:ask.format||ask.network||'вся реклама',min:dayMin,threshold:0.2}),
  // A filtered dimension would repeat the total line.
  ...(ask.format?[]:formats.slice(0,6)).flatMap(f=>anomalies(scoped.filter(r=>r.format===f.format),recent,{dimension:'format',label:f.format,min:dayMin,threshold:0.3})),
  ...(ask.network?[]:top).flatMap(n=>anomalies(scoped.filter(r=>r.network===n),recent,{dimension:'network',label:n,min:dayMin,threshold:0.3}))]
  .sort((a,b)=>Math.abs(b.revenue-b.baseline)-Math.abs(a.revenue-a.baseline)).slice(0,6);
 const baselineDays=[...covered].filter(d=>d<p.start&&d>=shift(p.start,-28)).length;

 return {apps,totals,chart:{days:chartDays,from:p.start,to:p.end,series,ecpm:ecpmByDay},networks:netRows,formats,matrix,countries:geo,countriesNarrowed:narrowed&&countries.length>0,
  anomalies:found,baselineDays,empty:!inPeriod.length};
}
module.exports={analyse,daysBetween,shift,group,ecpm,change,namedApps,FORMAT_ORDER};
