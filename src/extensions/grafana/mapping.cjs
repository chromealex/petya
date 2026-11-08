// Grafana panels ↔ game metrics for «Метрики игры». The user confirms the mapping in Settings → «Grafana»
// («Сопоставить панели с метриками»); Petya proposes it from panel titles, legends, descriptions, queries and
// units (name heuristics), and, when a local model is chosen, lets the model pick among the top candidates.
// Stored in the setting `grafanaMetricMap` as {metric: {d: dashboard uid, p: panel id, f: series name or '',
// t: panel title, dt: dashboard title}}.
const client=require('./client.cjs');
const dash=require('./dashboard.cjs');
const load=require('./load.cjs');
const kit=require('../app-kit.cjs');

const METRICS=[
 {id:'dau',label:'DAU'},{id:'new',label:'Новые пользователи'},{id:'revenue',label:'Выручка'},{id:'arpdau',label:'ARPDAU'},
 {id:'d1',label:'Ретеншн D1'},{id:'d7',label:'Ретеншн D7'},{id:'d30',label:'Ретеншн D30'}
];
const IDS=METRICS.map(m=>m.id);
const RET=/retention|ретеншн|ретенш|удержан|(?:^|[^a-z])ret(?:[^a-z]|$)/i;
const DAYN=n=>new RegExp('(?:^|[^a-z0-9])(?:d|д|day\\s?|день\\s?)'+n+'(?![0-9])|'+n+'\\s?(?:d|day|дн)(?![a-z])','i');
const PATTERNS={
 dau:/(?:^|[^a-z])(?:dau|daily active|active users|active players|unique users)(?![a-z])|активн\S*\s+(?:игрок|пользоват)|уникальн\S*\s+(?:игрок|пользоват)|(?:^|[^a-z])дау(?![а-я])/i,
 new:/new (?:users|players|installs|accounts)|(?:^|[^a-z])(?:installs?|registrations?|signups?|first[ _]open)(?![a-z])|нов\S*\s+(?:игрок|пользоват|аккаунт)|установк|регистрац/i,
 revenue:/revenue|gross|income|bookings|(?:^|[^a-z])(?:iap|purchases?|payments?)(?![a-z])|выручк|доход|платеж|платёж|оборот/i,
 arpdau:/arpdau|(?:^|[^a-z])arpu(?![a-z])/i
};
const ANTI={revenue:/arpdau|arpu|arppu|per user|на пользоват/i,dau:/(?:^|[^a-z])(?:mau|wau)(?![a-z])|retention|ретеншн/i,new:/retention|ретеншн/i};
// Dashboards that look like product KPIs win a tie over a feature dashboard with a panel of the same name.
const KPI=/metric|kpi|product|business|overview|retention|revenue|(?:^|[^a-z])dau(?![a-z])|метрик|продукт|ретеншн|выручк|обзор/i;
const isMoney=u=>/^currency/.test(u||'');
const isShare=u=>u==='percent'||u==='percentunit';

// Text of a target's query (expr, rawSql, query, …) for the heuristics.
const queryText=t=>['expr','rawSql','query','sql','target','rawQuery','queryText'].map(k=>typeof t?.[k]==='string'?t[k]:'').join(' ').slice(0,400);
const legend=t=>{const l=String(t?.legendFormat||t?.alias||'').trim();return l&&!/\{\{|\$/.test(l)?l.slice(0,60):'';};

function score(metric,{title,description,query,unit,type,series}){
 const text=title+' '+series;
 let n=0;
 if(metric.startsWith('d')&&metric!=='dau'){
  const day=metric.slice(1);
  const ret=RET.test(text)||RET.test(description)||RET.test(query);
  if(!ret)return 0;
  if(DAYN(day).test(series))n+=5;else if(DAYN(day).test(title))n+=4;else if(!/(?:^|[^a-z0-9])(?:d|д|day\s?)\d/i.test(title+' '+series))n+=1;else return 0;
  if(isShare(unit))n+=1;
  return n+(RET.test(title)?2:1);
 }
 const p=PATTERNS[metric];
 if(ANTI[metric]?.test(title+' '+series))return 0;
 if(p.test(series))n+=4;
 if(p.test(title))n+=3;
 if(p.test(description))n+=1;
 if(p.test(query))n+=2;
 if(!n)return 0;
 if((metric==='revenue'||metric==='arpdau')&&isMoney(unit))n+=1;
 if((metric==='dau'||metric==='new')&&isMoney(unit))n-=2;
 if(/timeseries|graph|barchart/.test(type))n+=1;
 if(type==='table')n-=1;
 return n;
}

// Candidates: every drawable panel, and each named series (legend) of a multi-query panel.
function candidates(dashboards){
 const out=[];
 for(const {d,panels} of dashboards){
  for(const p of panels){
   if(!['timeseries','graph','stat','singlestat','gauge','bargauge','barchart','table'].includes(p.type))continue;
   const unit=String(p.fieldConfig?.defaults?.unit||''),query=(p.targets||[]).map(queryText).join(' '),base={d:d.uid,dt:d.title,folder:d.folder,p:Number(p.id),t:String(p.title||'').slice(0,120),type:p.type,unit,description:String(p.description||'').slice(0,200),query,kpi:KPI.test(d.title+' '+(d.tags||[]).join(' '))};
   out.push({...base,f:''});
   const legends=(p.targets||[]).filter(t=>!t?.hide).map(legend).filter(Boolean);
   if(legends.length>1)for(const l of legends)out.push({...base,f:l});
  }
 }
 return out;
}
function rankAll(list){
 const by={};
 for(const m of IDS)by[m]=list.map(c=>({...c,score:(s=>s?s+(c.kpi?1:0):0)(score(m,{title:c.t,description:c.description,query:c.query,unit:c.unit,type:c.type,series:c.f}))})).filter(c=>c.score>=3).sort((a,b)=>b.score-a.score||(a.f?-1:1)).slice(0,6);
 return by;
}
const key=c=>c.d+'#'+c.p+'#'+c.f;
const entry=c=>({d:c.d,p:c.p,f:c.f||'',t:c.t,dt:c.dt});

// The best candidate per metric (heuristics), optionally re-chosen by the local model among the top candidates.
async function propose(s,{maxDashboards=25}={}){
 const c=client.config(s);
 const list=await client.search(s,{});
 const f=String(c.folder||'').toLowerCase();
 const order=[...list].sort((a,b)=>(f&&(b.folder.toLowerCase()===f||b.folderUid===c.folder))-(f&&(a.folder.toLowerCase()===f||a.folderUid===c.folder))||KPI.test(b.title+' '+b.tags.join(' '))-KPI.test(a.title+' '+a.tags.join(' '))||a.title.localeCompare(b.title));
 const cache=new Map();
 const dashboards=[];
 for(const d of order.slice(0,maxDashboards)){
  try{const r=await client.dashboard(s,d.uid);const panels=await Promise.all(dash.panels(r.dashboard).map(p=>load.resolveLibrary(s,p,cache)));dashboards.push({d,panels});}
  catch(e){if(e.status===401)throw e;}
 }
 const ranked=rankAll(candidates(dashboards));
 const proposal={},why={};
 for(const m of IDS)if(ranked[m][0]){proposal[m]=entry(ranked[m][0]);why[m]='heuristic';}
 if(s.settings.model){
  const ask=IDS.filter(m=>ranked[m].length>1);
  if(ask.length){
   try{
    const props=Object.fromEntries(ask.map(m=>[m,{type:'integer'}]));
    const r=await kit.modelJSON(s,{system:'Сопоставь метрики мобильной игры с панелями Grafana. Для каждой метрики верни номер самой подходящей панели из её списка или -1, если ни одна не подходит. Только номера.',
     user:{metrics:ask.map(m=>({id:m,name:METRICS.find(x=>x.id===m).label,panels:ranked[m].map((c,i)=>({n:i,dashboard:c.dt,panel:c.t,series:c.f||undefined,unit:c.unit||undefined,query:c.query.slice(0,160)||undefined}))}))},
     schema:{type:'object',properties:props,required:ask},predict:200,temperature:0});
    for(const m of ask){const i=r?.[m];if(Number.isInteger(i)&&i>=0&&i<ranked[m].length&&key(ranked[m][i])!==key(ranked[m][0])){proposal[m]=entry(ranked[m][i]);why[m]='model';}}
   }catch{/* heuristics stay */}
  }
 }
 return {proposal,why,candidates:Object.fromEntries(IDS.map(m=>[m,ranked[m].map(entry)])),dashboards:dashboards.length,metrics:METRICS};
}

// The saved mapping, validated (also used by the settings validator).
function parse(value){
 let v;try{v=typeof value==='string'?JSON.parse(value||'{}'):value;}catch{throw Error('Некорректное сопоставление панелей Grafana.');}
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Некорректное сопоставление панелей Grafana.');
 const out={};
 for(const [k,e] of Object.entries(v)){
  if(!IDS.includes(k))throw Error('Неизвестная метрика в сопоставлении Grafana: '+k);
  if(e===null)continue;
  if(!e||typeof e!=='object'||!/^[\w-]{1,64}$/.test(String(e.d||''))||!Number.isInteger(Number(e.p)))throw Error('Некорректная панель Grafana для метрики '+k+'.');
  out[k]={d:String(e.d),p:Number(e.p),f:String(e.f||'').slice(0,80),t:String(e.t||'').slice(0,80),dt:String(e.dt||'').slice(0,80)};
 }
 return out;
}
const read=settings=>{try{return parse(settings.grafanaMetricMap||'{}');}catch{return {};}};
module.exports={METRICS,IDS,score,candidates,rankAll,propose,parse,read};
