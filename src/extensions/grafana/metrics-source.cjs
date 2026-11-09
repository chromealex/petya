// Grafana as a «metrics-source» of «Метрики игры» (contract: src/extensions/metrics/sources.cjs). The panels the
// user mapped in Settings → «Grafana» are queried for the asked days with a 1-day interval, and their series are
// bucketed by UTC day: DAU, ARPDAU and retention by the day's mean, new users and revenue by the day's sum.
// - Revenue: a mapped revenue panel; otherwise ARPDAU × DAU per day when both are mapped.
// - Retention: panels plotting D1/D7/D30 (share of a cohort) by install day, turned into cohorts with the mapped
//   «Новые пользователи» as the cohort size (the card computes weighted retention from cohorts).
// - Platform / version: set through a dashboard variable named like platform/os or version/build when it has
//   that option; otherwise noted as not applied.
const client=require('./client.cjs');
const dash=require('./dashboard.cjs');
const load=require('./load.cjs');
const mapping=require('./mapping.cjs');
const DAY=86400000;
const key=ms=>new Date(ms).toISOString().slice(0,10);
const MEAN=new Set(['dau','arpdau','d1','d7','d30']);

// Platform / version through the dashboard's own variables.
function filters(vars,q,unavailable,metric){
 const set=(pattern,wanted,label)=>{
  if(!wanted)return;
  const v=vars.find(x=>pattern.test(x.name)||pattern.test(x.label));
  const o=v?.options.find(o=>o.value.toLowerCase()===String(wanted).toLowerCase()||o.text.toLowerCase()===String(wanted).toLowerCase());
  if(v&&o){v.value=[o.value];v.values=[o.value];v.text=[o.text];v.all=false;v.raw=false;}
  else if(!unavailable.some(u=>u.metric===label))unavailable.push({metric:label,reason:'Grafana: у дашборда «'+metric.dt+'» нет переменной для фильтра '+(label==='platform'?'по платформе':'по версии')+' — показаны все данные.'});
 };
 set(/^(?:platform|os|платформ\p{L}*)$/iu,q.platform,'platform');
 set(/^(?:version|app_?version|build|верси\p{L}*)$/iu,q.version,'version');
}

// One mapped panel → daily points [{date, value}] and its unit.
async function daily(s,m,metric,q,ctx,unavailable){
 if(!ctx.dash.has(m.d))ctx.dash.set(m.d,client.dashboard(s,m.d));
 const {dashboard:d}=await ctx.dash.get(m.d);
 const all=await Promise.all(dash.panels(d).map(p=>load.resolveLibrary(s,p,ctx.library)));
 const panel=all.find(p=>Number(p.id)===m.p);
 if(!panel)throw Error('Grafana: на дашборде «'+(m.dt||m.d)+'» нет панели «'+(m.t||m.p)+'». Обновите сопоставление в настройках «Grafana».');
 const vars=dash.variables(d,{});filters(vars,q,unavailable,m);
 const from=Date.parse(q.from+'T00:00:00Z'),to=Date.parse(q.to+'T23:59:59.999Z'),days=Math.round((to-from)/DAY);
 const r={from,to,raw:{from:String(from),to:String(to)}};
 // The asked days, a day per point: the panel's own interval and relative time do not apply here.
 const reqs=await dash.requests({...panel,interval:undefined,timeFrom:undefined,timeShift:undefined,maxDataPoints:days+1},{vars,range:r,lookup:ctx.lookup,maxDataPoints:days+1,dashboard:d.title});
 for(const x of reqs)for(const t of x.queries){t.intervalMs=DAY;t.interval='1d';}
 const parts=[];for(const x of reqs)parts.push(dash.frames(await client.query(s,x)));
 const errors=parts.flatMap(p=>p.errors);
 const series=dash.numericSeries(parts.flatMap(p=>p.frames)).filter(x=>x.time);
 if(!series.length)throw Error(errors.length?'Grafana: '+errors[0].error:'Grafana: панель «'+(m.t||m.p)+'» не вернула ряд по времени.');
 const want=String(m.f||'').toLowerCase();
 const one=want?series.find(x=>x.name.toLowerCase()===want)||series.find(x=>x.name.toLowerCase().includes(want)):series[0];
 if(!one)throw Error('Grafana: в панели «'+(m.t||m.p)+'» нет ряда «'+m.f+'».');
 const unit=String(dash.config(panel,one.name,one.refId).unit||'');
 const by=new Map();
 one.time.forEach((t,i)=>{const v=one.values[i];if(!Number.isFinite(t)||v===null)return;const k=key(t);if(t<from||t>to)return;if(!by.has(k))by.set(k,[]);by.get(k).push(v);});
 const points=[...by].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,list])=>({date,value:MEAN.has(metric)?list.reduce((a,b)=>a+b,0)/list.length:list.reduce((a,b)=>a+b,0)}));
 return {points,unit};
}
const share=(v,unit)=>unit==='percentunit'?v:unit==='percent'?v/100:v>1?v/100:v;
const currency=(unit,settings)=>{const m=String(unit||'').match(/^currency(USD|EUR|RUB|GBP|JPY|CNY|KRW|TRY|BRL|INR)$/);return 'currency:'+(m?m[1]:['RUB','USD','EUR'].includes(settings.grafanaCurrency)?settings.grafanaCurrency:'USD');};
const context=s=>({dash:new Map(),library:new Map(),lookup:load.lookup(s)});

module.exports={
 id:'grafana',name:'Grafana',
 ready:settings=>settings.extension_grafana==='true'&&client.connected(settings)&&['dau','new','revenue','arpdau'].some(k=>mapping.read(settings)[k]),
 apps:()=>[],
 // «DAU из wombyte»: the connected Grafana answers to its host's name (dashboards.wombyte.net → wombyte).
 names:settings=>['Графана',...client.names(settings.grafanaUrl)],
 async fetch(s,q){
  const map=mapping.read(s.settings),ctx=context(s),series=[],unavailable=[];
  const want=q.metrics||['dau','new','revenue'];
  const get=async metric=>map[metric]?daily(s,map[metric],metric,q,ctx,unavailable):null;
  // DAU / new users: a failure here (token, access, timeout) is the whole source's failure.
  const dau=want.includes('dau')||want.includes('revenue')?await get('dau'):null;
  const fresh=want.includes('new')?await get('new'):null;
  if(dau&&want.includes('dau'))series.push({metric:'dau',unit:'users',series:dau.points});
  if(fresh)series.push({metric:'new',unit:'users',series:fresh.points});
  if(want.includes('revenue')){
   try{
    const rev=await get('revenue');
    if(rev)series.push({metric:'revenue',unit:currency(rev.unit,s.settings),series:rev.points});
    else if(map.arpdau&&dau){
     const arp=await get('arpdau'),by=new Map(dau.points.map(p=>[p.date,p.value]));
     series.push({metric:'revenue',unit:currency(arp.unit,s.settings),series:arp.points.filter(p=>by.has(p.date)).map(p=>({date:p.date,value:p.value*by.get(p.date)}))});
     unavailable.push({metric:'revenue-derived',reason:'Выручка из Grafana посчитана как ARPDAU × DAU по дням.'});
    }else unavailable.push({metric:'revenue',reason:'Выручка: в настройках «Grafana» не сопоставлена панель выручки (или ARPDAU).'});
   }catch(e){if(e.status===401)throw e;unavailable.push({metric:'revenue',reason:'Выручка недоступна: '+e.message});}
  }
  if(!series.length)throw Error('В настройках «Grafana» не сопоставлены панели DAU / новых пользователей / выручки.');
  return {app:null,series,unavailable};
 },
 // Retention panels (share by install day) → cohorts sized by the mapped new users.
 async retention(s,q){
  const map=mapping.read(s.settings);
  const days=['d1','d7','d30'].filter(k=>map[k]);
  if(!days.length)return null;
  if(!map.new)throw Error('для ретеншна из Grafana сопоставьте и «Новые пользователи» (размер когорты)');
  const ctx=context(s),unavailable=[];
  const fresh=await daily(s,map.new,'new',q,ctx,unavailable);
  const rates={};for(const k of days){const r=await daily(s,map[k],k,q,ctx,unavailable);rates[k]=new Map(r.points.map(p=>[p.date,share(p.value,r.unit)]));}
  const cohorts=fresh.points.filter(p=>p.value>0).map(p=>{const returned={};for(const k of days){const n=Number(k.slice(1)),v=rates[k].get(p.date);if(Number.isFinite(v)&&key(Date.parse(p.date)+n*DAY)<=q.to)returned[n]=Math.round(v*p.value);}return {date:p.date,size:p.value,returned};});
  return {cohorts};
 }
};
