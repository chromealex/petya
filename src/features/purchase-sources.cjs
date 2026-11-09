// Purchase sources: services that report in-app purchases of a game — App Store Connect sales reports, Google Play
// sales reports in Cloud Storage, a purchases table in a connected database, … Petya itself knows no store.
// An extension declares in its extension.json
//   "provides": { "purchase-source": "<file>.cjs" }   (or a list of files)
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`), and each file exports
//   { id, name, ready(settings) -> bool, hint?(settings) -> text, maxDays?, names?: [RegExp],
//     confirm?: true,                                         // reading runs something the user must see first (SQL)
//     async plan?(services, {start, end}) -> {sql, connection:{id, name, dialect}, note?},   // with confirm
//     async fetch(services, {start, end, plan?, check}) -> {rows:[raw row], payers?, notes?:[text], truncated?} }
// `start`/`end` are inclusive UTC days 'YYYY-MM-DD', already bounded here. A source with `confirm` is read only with
// the plan the user confirmed (the app keeps it on the card and passes it back); the registry refuses otherwise.
// Each raw row becomes (see `row`):
//   {date, store, product, title, type:'iap'|'subscription', kind:'purchase'|'refund', units, amount, currency,
//    proceeds, proceedsCurrency, country, platform, source}
// `amount` is what buyers paid (units × customer price, before the store's commission), always ≥ 0 — a refund is a
// row of kind 'refund' with a positive amount. Money is in `currency` and is never converted or added across
// currencies (`summarize` keeps one group per currency).
// `payers` (only sources that know buyers, e.g. a purchases table with user ids):
//   {total, newPayers, days:[{date, payers}], byCurrency:[{currency, payers, amount}], first:[{product, title?, payers}]}
// counted once per buyer by the source (distinct buyers cannot be added up from rows).
const path=require('node:path');
const KIND='purchase-source';
const MAX_SPAN=92,MAX_ROWS=100000;

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  const bad=()=>Error('Invalid purchase source '+x.extension+'/'+x.file);
  if(typeof p.ready!=='function'||typeof p.fetch!=='function'||typeof p.name!=='string')throw bad();
  if(p.hint!==undefined&&typeof p.hint!=='function')throw bad();
  if(p.confirm&&typeof p.plan!=='function')throw bad();
  if(p.names!==undefined&&(!Array.isArray(p.names)||p.names.some(r=>!(r instanceof RegExp))))throw bad();
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name,source:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

const text=(v,max=200)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const num=v=>{const n=typeof v==='string'?Number(v.replace(/[\s ]/g,'').replace(',','.')):Number(v);return Number.isFinite(n)?n:0;};
const PLATFORMS={ios:'ios',iphone:'ios',ipad:'ios',ipod:'ios',tvos:'ios',macos:'ios',android:'android',google_play:'android',googleplay:'android'};
const platform=v=>PLATFORMS[String(v||'').toLowerCase().replace(/[\s-]+/g,'_')]||'';
const country=v=>{const c=String(v||'').trim().toUpperCase();return /^[A-Z]{2}$/.test(c)&&c!=='ZZ'&&c!=='XX'?c:'';};
// ISO 4217 or '' (unknown: shown as «валюта не указана», still never mixed with a known one).
const currency=v=>{const c=String(v||'').trim().toUpperCase();return /^[A-Z]{3}$/.test(c)?c:'';};
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const round=v=>Math.round(v*10000)/10000;
// One row of a source in the shape every consumer reads. Negative units or amounts are refunds.
function row(raw,source,fallback={}){
 const date=String(raw?.date||'').slice(0,10);
 const units=num(raw?.units??1),amount=num(raw?.amount);
 const refund=raw?.kind==='refund'||units<0||amount<0;
 const proceeds=raw?.proceeds===undefined||raw?.proceeds===null||raw?.proceeds===''?null:Math.abs(num(raw.proceeds));
 return {date:DAY.test(date)?date:'',store:text(raw?.store||fallback.store,40),product:text(raw?.product,160)||'—',title:text(raw?.title,200),
  type:raw?.type==='subscription'?'subscription':'iap',kind:refund?'refund':'purchase',units:Math.abs(Math.round(units)),amount:round(Math.abs(amount)),
  currency:currency(raw?.currency),proceeds:proceeds===null?null:round(proceeds),proceedsCurrency:proceeds===null?'':currency(raw?.proceedsCurrency),
  country:country(raw?.country),platform:platform(raw?.platform||fallback.platform),source};
}
function payersOf(raw){
 if(!raw||typeof raw!=='object')return null;
 const n=v=>{const x=num(v);return x>=0?Math.round(x):0;};
 return {total:n(raw.total),newPayers:raw.newPayers===undefined||raw.newPayers===null?null:n(raw.newPayers),
  days:(Array.isArray(raw.days)?raw.days:[]).filter(d=>DAY.test(String(d?.date||''))).map(d=>({date:String(d.date),payers:n(d.payers)})),
  byCurrency:(Array.isArray(raw.byCurrency)?raw.byCurrency:[]).map(c=>({currency:currency(c?.currency),payers:n(c?.payers),amount:round(Math.abs(num(c?.amount)))})).filter(c=>c.payers>0),
  first:(Array.isArray(raw.first)?raw.first:[]).map(f=>({product:text(f?.product,160)||'—',title:text(f?.title,200),payers:n(f?.payers)})).filter(f=>f.payers>0).sort((a,b)=>b.payers-a.payers).slice(0,30)};
}

// --- Periods ------------------------------------------------------------------------------------------------------
const day=d=>new Date(d).toISOString().slice(0,10);
const shift=(d,n)=>day(Date.parse(d+'T00:00:00Z')+n*86400e3);
const span=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400e3)+1;
function bound({start,end},{now=Date.now(),maxDays=365}={}){
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

// --- Aggregates -----------------------------------------------------------------------------------------------------
// Totals by dimensions ('product', 'date', 'country', 'platform', 'store'), one group per currency and dimension values:
// units and amount of purchases, refunds separately, net = purchases − refunds of the same currency.
function summarize(rows,by=[]){
 const keys=[].concat(by),map=new Map();
 for(const r of rows){
  const k=[...keys.map(d=>r[d]),r.currency].join('\u0001');
  let g=map.get(k);
  if(!g){g={...Object.fromEntries(keys.map(d=>[d,r[d]])),...(keys.includes('product')?{title:r.title,type:r.type}:{}),currency:r.currency,units:0,amount:0,refunds:0,refunded:0};map.set(k,g);}
  if(r.kind==='refund'){g.refunds+=r.units;g.refunded+=r.amount;}else{g.units+=r.units;g.amount+=r.amount;if(!g.title&&r.title)g.title=r.title;}
 }
 return [...map.values()].map(g=>({...g,amount:Math.round(g.amount*100)/100,refunded:Math.round(g.refunded*100)/100,net:Math.round((g.amount-g.refunded)*100)/100,refundRate:g.units>0?g.refunds/g.units:null}))
  .sort((a,b)=>a.currency.localeCompare(b.currency)||b.amount-a.amount);
}
// Currencies by how much they carry (transactions, not money: different currencies are not comparable).
function currencies(rows){
 const n=new Map();for(const r of rows)if(r.kind==='purchase')n.set(r.currency,(n.get(r.currency)||0)+r.units);
 return [...n].sort((a,b)=>b[1]-a[1]).map(([c])=>c);
}

// --- The registry bound to live services ---------------------------------------------------------------------------
function create(s,{sources,now=()=>Date.now()}={}){
 let list=sources;
 const all=()=>list||(list=require('../extension-registry.cjs').cached('purchase-sources',()=>load()));
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const connected=x=>{try{return !!x.source.ready(s.settings||{});}catch{return false;}};
 const ready=x=>added(x)&&connected(x);
 const hint=x=>{try{return typeof x.source.hint==='function'?String(x.source.hint(s.settings||{})||''):'';}catch{return '';}};
 const describe=x=>({id:x.id,name:x.name,extension:x.extension,added:added(x),connected:connected(x),ready:ready(x),hint:hint(x),confirm:!!x.source.confirm,maxDays:Number(x.source.maxDays)||null});
 const live=id=>{const x=all().find(y=>y.id===id);if(!x)throw Error('Нет такого источника покупок.');if(!ready(x))throw Error('Источник «'+x.name+'» не добавлен или не подключён.');return x;};
 // What a confirming source would run (shown on the card before anything is read).
 async function plan(id,range={}){
  const x=live(id);if(!x.source.confirm)return null;
  const r=bound(range,{now:now(),maxDays:Number(x.source.maxDays)||365});
  const p=await x.source.plan(s,{start:r.start,end:r.end});
  return p?{...p,source:x.id,start:r.start,end:r.end}:null;
 }
 async function fetch(id,range={},{plan:confirmed=null,check=()=>{}}={}){
  const x=live(id);
  const r=bound(range,{now:now(),maxDays:Number(x.source.maxDays)||365});
  if(x.source.confirm&&(!confirmed||confirmed.source!==x.id||!confirmed.sql))throw Error('Запрос к «'+x.name+'» выполняется только после подтверждения.');
  const out=await x.source.fetch(s,{start:r.start,end:r.end,plan:confirmed,check});
  check();
  const raw=Array.isArray(out)?out:Array.isArray(out?.rows)?out.rows:null;
  if(!raw)throw Error(x.name+' вернул некорректный отчёт.');
  const rows=raw.slice(0,MAX_ROWS).map(v=>row(v,x.id,{store:x.id})).filter(v=>v.date&&v.date>=r.start&&v.date<=r.end&&(v.units>0||v.amount>0));
  return {source:{id:x.id,name:x.name},start:r.start,end:r.end,days:r.days,rows,payers:payersOf(out?.payers),truncated:!!out?.truncated||raw.length>MAX_ROWS,
   notes:[...r.notes,...(Array.isArray(out?.notes)?out.notes.map(n=>text(n,300)):[])].slice(0,6)};
 }
 const named=command=>all().filter(x=>(x.source.names||[]).some(re=>{re.lastIndex=0;return re.test(String(command||''));})).map(x=>x.id);
 return {all:()=>all().map(describe),list:()=>all().filter(ready).map(describe),find:id=>{const x=all().find(y=>y.id===id);return x?describe(x):null;},named,plan,fetch};
}

module.exports={KIND,MAX_SPAN,load,create,row,payersOf,bound,summarize,currencies,platform,country,currency,shift,span,directory:path.join(__dirname,'../extensions')};
