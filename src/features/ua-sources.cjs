// UA sources: ad networks that report what buying users cost — spend, installs, clicks and impressions per day,
// campaign, country and platform (AppLovin Axon, Unity Ads, Meta, Google Ads, …). Petya itself knows no network.
// An extension declares in its extension.json
//   "provides": { "ua-source": "<file>.cjs" }   (or a list of files)
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`), and each file exports
//   { id, name, ready(settings) -> bool, hint?(settings) -> text, maxDays?,
//     names?: [RegExp],                                     // how a request names it («в Unity Ads», «в фейсбуке»)
//     async fetch(services, {start, end, check}) -> {rows:[raw row], notes?:[text], truncated?} }
// `start`/`end` are inclusive UTC days 'YYYY-MM-DD', already bounded here (never in the future, at most `maxDays`
// back and at most MAX_SPAN days long). Each raw row becomes (see `row`):
//   {date, network, campaign, campaignId, country, platform, spend, installs, clicks, impressions, currency, source}
// country is ISO 3166 alpha-2 or '', platform 'ios'|'android'|'' , currency ISO 4217 (spend is in it; nothing is
// converted — `summarize` never adds different currencies). A source only reads reports.
// Helpers for consumers (a UA campaigns card, anomalies, ROAS with ad revenue): `summarize` by any dimension with
// CPI/CTR/CVR, `period` (a model-free reading of «за неделю», «вчера», «за 14 дней»), `roas`.
const path=require('node:path');
const KIND='ua-source';
const MAX_SPAN=92,MAX_ROWS=50000;

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  const bad=()=>Error('Invalid UA source '+x.extension+'/'+x.file);
  if(typeof p.ready!=='function'||typeof p.fetch!=='function'||typeof p.name!=='string')throw bad();
  if(p.hint!==undefined&&typeof p.hint!=='function')throw bad();
  if(p.names!==undefined&&(!Array.isArray(p.names)||p.names.some(r=>!(r instanceof RegExp))))throw bad();
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name,source:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

const text=(v,max=200)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const num=v=>{const n=typeof v==='string'?Number(v.replace(/[\s,]/g,'')):Number(v);return Number.isFinite(n)&&n>=0?n:0;};
const PLATFORMS={ios:'ios',iphone:'ios',ipad:'ios',ipod:'ios',tvos:'ios',android:'android',fireos:'android',amazon:'android',google_play:'android'};
const platform=v=>PLATFORMS[String(v||'').toLowerCase().replace(/[\s-]+/g,'_')]||'';
const country=v=>{const c=String(v||'').trim().toUpperCase();return /^[A-Z]{2}$/.test(c)&&c!=='ZZ'&&c!=='XX'?c:'';};
const currency=v=>{const c=String(v||'').trim().toUpperCase();return /^[A-Z]{3}$/.test(c)?c:'USD';};
const DAY=/^\d{4}-\d{2}-\d{2}$/;
// One row of a source in the shape every consumer reads.
function row(raw,source,fallback={}){
 const date=String(raw?.date||'').slice(0,10);
 return {date:DAY.test(date)?date:'',network:text(raw?.network||fallback.network,80),campaign:text(raw?.campaign,200)||'Без названия',campaignId:text(raw?.campaignId,120),
  country:country(raw?.country),platform:platform(raw?.platform),spend:Math.round(num(raw?.spend)*1e4)/1e4,installs:Math.round(num(raw?.installs)),
  clicks:Math.round(num(raw?.clicks)),impressions:Math.round(num(raw?.impressions)),currency:currency(raw?.currency||fallback.currency),source};
}

// --- Periods ------------------------------------------------------------------------------------------------------
const day=d=>new Date(d).toISOString().slice(0,10);
const shift=(d,n)=>day(Date.parse(d+'T00:00:00Z')+n*86400e3);
const span=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400e3)+1;
// The window a source can serve: never after today (UTC), at most `maxDays` back, at most MAX_SPAN days long.
function bound({start,end},{now=Date.now(),maxDays=MAX_SPAN}={}){
 const today=day(now);
 let e=DAY.test(String(end||''))?String(end):shift(today,-1);if(e>today)e=today;
 let s=DAY.test(String(start||''))?String(start):shift(e,-6);if(s>e)s=e;
 const notes=[];
 const earliest=shift(today,-(Math.max(1,Math.min(maxDays,3650))-1));
 if(s<earliest){s=earliest;notes.push('Отчёт доступен с '+earliest+'.');}
 if(e<s)e=s;
 if(span(s,e)>MAX_SPAN){s=shift(e,-(MAX_SPAN-1));notes.push('Период сокращён до '+MAX_SPAN+' дней.');}
 return {start:s,end:e,days:span(s,e),notes};
}
// «вчера», «сегодня», «за неделю» (the last 7 full days), «за 14 дней», «за месяц», «в этом месяце», «на прошлой неделе».
function period(textIn,now=Date.now()){
 const t=String(textIn||''),today=day(now),yesterday=shift(today,-1);
 const n=/за\s+(?:последни\p{L}*\s+)?(\d{1,3})\s*(дн\p{L}*|день|недел\p{L}*|месяц\p{L}*)/iu.exec(t);
 if(n){const k=Number(n[1]),u=n[2].toLowerCase(),d=/^недел/.test(u)?7*k:/^месяц/.test(u)?30*k:k;return {start:shift(yesterday,-(d-1)),end:yesterday,label:'за '+k+' '+(/^недел/.test(u)?'нед.':/^месяц/.test(u)?'мес.':'дн.')};}
 if(/позавчера/iu.test(t))return {start:shift(today,-2),end:shift(today,-2),label:'позавчера'};
 if(/вчера/iu.test(t))return {start:yesterday,end:yesterday,label:'вчера'};
 if(/сегодня/iu.test(t))return {start:today,end:today,label:'сегодня',partial:true};
 if(/прошл\p{L}* недел/iu.test(t)){const dow=(new Date(today+'T00:00:00Z').getUTCDay()+6)%7;const mon=shift(today,-dow-7);return {start:mon,end:shift(mon,6),label:'на прошлой неделе'};}
 if(/(?:эт\p{L}*|текущ\p{L}*) месяц/iu.test(t))return {start:today.slice(0,8)+'01',end:today,label:'в этом месяце',partial:true};
 if(/прошл\p{L}* месяц/iu.test(t)){const first=today.slice(0,8)+'01';const prevEnd=shift(first,-1);return {start:prevEnd.slice(0,8)+'01',end:prevEnd,label:'в прошлом месяце'};}
 if(/за\s+месяц|за\s+30/iu.test(t))return {start:shift(yesterday,-29),end:yesterday,label:'за 30 дней'};
 return {start:shift(yesterday,-6),end:yesterday,label:'за 7 дней'};
}

// --- Aggregates -----------------------------------------------------------------------------------------------------
const ratio=(a,b)=>b>0?a/b:null;
// Totals by one or more dimensions ('network', 'campaign', 'country', 'platform', 'date'), one row per currency.
function summarize(rows,by=[]){
 const keys=[].concat(by);
 const map=new Map();
 for(const r of rows){
  const k=[...keys.map(d=>d==='campaign'?r.network+'\u0000'+(r.campaignId||r.campaign):r[d]),r.currency].join('\u0001');
  let g=map.get(k);
  if(!g){g={...Object.fromEntries(keys.map(d=>[d,r[d]])),...(keys.includes('campaign')?{network:r.network,campaignId:r.campaignId}:{}),currency:r.currency,spend:0,installs:0,clicks:0,impressions:0};map.set(k,g);}
  g.spend+=r.spend;g.installs+=r.installs;g.clicks+=r.clicks;g.impressions+=r.impressions;
 }
 return [...map.values()].map(g=>({...g,spend:Math.round(g.spend*100)/100,cpi:ratio(g.spend,g.installs),ctr:ratio(g.clicks,g.impressions),cvr:ratio(g.installs,g.clicks)})).sort((a,b)=>b.spend-a.spend);
}
const roas=(revenue,spend)=>spend>0&&Number.isFinite(revenue)?revenue/spend:null;

// --- The registry bound to live services ---------------------------------------------------------------------------
function create(s,{sources,now=()=>Date.now()}={}){
 let list=sources;
 const all=()=>list||(list=load());
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const connected=x=>{try{return !!x.source.ready(s.settings||{});}catch{return false;}};
 const ready=x=>added(x)&&connected(x);
 const hint=x=>{try{return typeof x.source.hint==='function'?String(x.source.hint(s.settings||{})||''):'';}catch{return '';}};
 const describe=x=>({id:x.id,name:x.name,extension:x.extension,added:added(x),connected:connected(x),ready:ready(x),hint:hint(x),maxDays:Number(x.source.maxDays)||null});
 const live=id=>{const x=all().find(y=>y.id===id);if(!x)throw Error('Нет такого источника расходов на рекламу.');if(!ready(x))throw Error('Источник «'+x.name+'» не добавлен или не подключён.');return x;};
 async function fetch(id,range={},{check=()=>{}}={}){
  const x=live(id);
  const r=bound(range,{now:now(),maxDays:Number(x.source.maxDays)||MAX_SPAN});
  const out=await x.source.fetch(s,{start:r.start,end:r.end,check});
  check();
  const raw=Array.isArray(out)?out:Array.isArray(out?.rows)?out.rows:null;
  if(!raw)throw Error(x.name+' вернул некорректный отчёт.');
  const rows=raw.slice(0,MAX_ROWS).map(v=>row(v,x.id,{network:x.name})).filter(v=>v.date&&v.date>=r.start&&v.date<=r.end);
  return {source:{id:x.id,name:x.name},start:r.start,end:r.end,days:r.days,rows,truncated:!!out?.truncated||raw.length>MAX_ROWS,notes:[...r.notes,...(Array.isArray(out?.notes)?out.notes.map(n=>text(n,300)):[])].slice(0,6)};
 }
 // Every ready source for one period: what failed is reported next to what was read.
 async function fetchAll(range,opts){
  const rows=[],used=[],failed=[],notes=[];let start=null,end=null;
  for(const x of all().filter(ready)){
   try{const r=await fetch(x.id,range,opts);rows.push(...r.rows);used.push(r.source);notes.push(...r.notes);start=start&&start<r.start?start:r.start;end=end&&end>r.end?end:r.end;}
   catch(e){failed.push({id:x.id,name:x.name,error:e.message});}
  }
  return {rows,used,failed,notes:[...new Set(notes)],start,end};
 }
 const named=command=>all().filter(x=>(x.source.names||[]).some(r=>{r.lastIndex=0;return r.test(String(command||''));})).map(x=>x.id);
 return {all:()=>all().map(describe),list:()=>all().filter(ready).map(describe),find:id=>{const x=all().find(y=>y.id===id);return x?describe(x):null;},named,fetch,fetchAll};
}

module.exports={name:'uaSources',defaults:{},validate(){},KIND,MAX_SPAN,load,create,row,bound,period,summarize,roas,platform,country,shift,directory:path.join(__dirname,'../extensions'),
 setup(s){return {uaSources:create(s)};}};
