// Loads a Grafana dashboard and runs its panels' queries: dashboard JSON → library panels merged → variables and
// time range resolved → /api/ds/query per panel (at most 4 at once) → frames → the card's panel views.
// Read-only: only GETs and the panels' own queries.
const client=require('./client.cjs');
const dash=require('./dashboard.cjs');
const links=require('./links.cjs');
const MAX_PANELS=8,PARALLEL=4;

// Legacy datasource names and the default datasource, from /api/frontend/settings (read once per load).
function lookup(s){
 let settings=null;
 const load=async()=>settings||(settings=await client.frontendSettings(s).catch(()=>({})));
 return async(name,byValue)=>{
  const fs=await load(),list=fs?.datasources&&typeof fs.datasources==='object'?fs.datasources:{};
  const as=(x,n)=>x&&x.uid?{uid:String(x.uid),type:String(x.type||'')}:null;
  if(name===null||name==='default'){const d=list[fs?.defaultDatasource]||Object.values(list).find(x=>x?.isDefault);return as(d)||null;}
  if(list[name])return as(list[name]);
  const byUid=Object.values(list).find(x=>x?.uid===name);if(byUid)return as(byUid);
  return byValue?{uid:String(name),type:''}:null;
 };
}

// A library panel's model in place of the dashboard's reference (its own id and position kept).
async function resolveLibrary(s,panel,cache){
 const uid=panel.libraryPanel?.uid;
 if(!uid||panel.targets&&panel.type)return panel;
 if(!cache.has(uid))cache.set(uid,client.libraryPanel(s,uid).catch(e=>({error:e.message})));
 const model=await cache.get(uid);
 if(!model||model.error)return {...panel,type:panel.type||'library',error:'Библиотечная панель недоступна'+(model?.error?': '+model.error:'.')};
 return {...model,id:panel.id,gridPos:panel.gridPos||model.gridPos,row:panel.row,libraryPanel:panel.libraryPanel,title:panel.title||model.title};
}

async function pool(items,n,work){const out=new Array(items.length);let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;out[k]=await work(items[k],k);}}));return out;}

// One panel's data: every request of the panel, frames merged; a refId error stays with the panel.
async function runPanel(s,panel,{vars,range:r,lookup:look,dashboard:title,maxDataPoints}){
 const reqs=await dash.requests(panel,{vars,range:r,lookup:look,maxDataPoints,dashboard:title});
 if(!reqs.length)return {frames:[],errors:[{refId:'',error:'У панели нет запросов.'}]};
 const parts=await Promise.all(reqs.map(q=>client.query(s,q).then(res=>dash.frames(res)).catch(e=>{if(e.status===401)throw e;return {frames:[],errors:[{refId:'',error:e.message}]};})));
 return {frames:parts.flatMap(p=>p.frames),errors:parts.flatMap(p=>p.errors)};
}

const RANGE_LABEL={'now-1h':'за час','now-6h':'за 6 часов','now-12h':'за 12 часов','now-24h':'за сутки','now-1d':'за сутки','now-2d':'за 2 дня','now-7d':'за неделю','now-14d':'за 2 недели','now-30d':'за месяц','now-90d':'за квартал','now-1y':'за год','now/d':'сегодня','now-1d/d':'вчера'};
function rangeLabel(raw,r){
 if(raw.to==='now'&&RANGE_LABEL[raw.from])return RANGE_LABEL[raw.from];
 if(raw.from===raw.to&&RANGE_LABEL[raw.from])return RANGE_LABEL[raw.from];
 const m=String(raw.from).match(/^now-(\d+)([mhdwMy])$/);
 if(m&&raw.to==='now')return 'за '+m[1]+' '+{m:'мин',h:'ч',d:'дн',w:'нед',M:'мес',y:'г'}[m[2]]+'.';
 const d=t=>new Date(t).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 return d(r.from)+' — '+d(r.to);
}

// The card of one dashboard. `link` = a parsed pasted link (uid, viewPanel, from/to, vars), `ask` = the request
// ({range, text, panelId}).
async function open(s,{uid,link=null,ask={},now=Date.now()}){
 const c=client.config(s);
 const {dashboard:d,meta={}}=await client.dashboard(s,uid);
 const vars=dash.variables(d,{link:link?.vars||{},text:ask.text||''});
 const raw=link?.from&&link?.to?{from:link.from,to:link.to,source:'link'}:ask.range?{from:ask.range.from,to:ask.range.to,source:'request'}:{from:d.time?.from||'now-6h',to:d.time?.to||'now',source:'dashboard'};
 const r=dash.range(raw,now);
 const cache=new Map(),look=lookup(s);
 let all=await Promise.all(dash.panels(d).map(p=>resolveLibrary(s,p,cache)));
 const panelId=link?.viewPanel??ask.panelId??null;
 let chosen;
 if(panelId!==null&&panelId!==undefined){chosen=all.filter(p=>Number(p.id)===Number(panelId));if(!chosen.length)throw Object.assign(Error('На дашборде «'+(d.title||uid)+'» нет панели '+panelId+'.'),{question:true});}
 else chosen=all.filter(p=>p.type&&p.type!=='row').slice(0,MAX_PANELS);
 const slug=meta.slug||link?.slug||'';
 const shownVars=Object.fromEntries(vars.filter(v=>v.from!=='dashboard').map(v=>[v.name,v.value]));
 const urlFor=viewPanel=>links.dashboard(c.url,{uid:d.uid||uid,slug,from:raw.from,to:raw.to,vars:shownVars,viewPanel,orgId:link?.orgId||meta.orgId||null});
 const views=await pool(chosen,PARALLEL,async p=>{
  const head={id:Number(p.id),title:String(p.title||'').slice(0,160),type:String(p.type||''),row:String(p.row||'').slice(0,120),description:String(p.description||'').slice(0,300),url:urlFor(p.id),w:Number(p.gridPos?.w)||12,library:!!p.libraryPanel};
  if(p.error)return {...head,kind:'unsupported',error:p.error};
  if(p.repeat)head.repeat=String(p.repeat);
  const k=dash.kind(p.type);
  if(k==='unsupported')return {...head,...dash.view(p,{frames:[]},{range:r})};
  const pr=dash.range(raw,now,p);
  try{
   const data=await runPanel(s,p,{vars,range:pr,lookup:look,dashboard:d.title,maxDataPoints:300});
   const v=dash.view(p,data,{range:pr});
   const empty=v.kind==='timeseries'?!v.series.length:v.kind==='table'?!v.rows.length:!(v.items||[]).length;
   return {...head,...v,...pr.panel?{time:pr.panel}:{},...(data.errors.length&&empty?{error:data.errors.map(e=>(e.refId?e.refId+': ':'')+e.error).join('; ').slice(0,400)}:data.errors.length?{warning:data.errors.map(e=>(e.refId?e.refId+': ':'')+e.error).join('; ').slice(0,300)}:{}),...(empty&&!data.errors.length?{empty:true}:{})};
  }catch(e){if(e.status===401)throw e;return {...head,kind:dash.kind(p.type),error:e.message};}
 });
 // Every panel failing the same way (e.g. a timeout) is the card's failure, not eight error tiles.
 if(views.length&&views.every(v=>v.error&&v.kind!=='unsupported')&&new Set(views.map(v=>v.error)).size===1)throw Error(views[0].error);
 return {kind:'dashboard',base:c.url,uid:String(d.uid||uid),slug,title:String(d.title||uid).slice(0,200),folder:String(meta.folderTitle||'').slice(0,120),
  tags:(d.tags||[]).map(String).slice(0,6),url:urlFor(panelId??undefined),dashboardUrl:urlFor(),
  range:{from:r.from,to:r.to,raw:{from:raw.from,to:raw.to},source:raw.source,label:rangeLabel(raw,r)},
  vars:vars.filter(v=>v.hide<2&&v.type!=='constant').map(v=>({name:v.name,label:v.label,text:v.text.slice(0,5).map(x=>String(x).slice(0,60)),from:v.from})),
  panels:views,viewPanel:panelId??null,total:all.filter(p=>p.type&&p.type!=='row').length,render:c.render,orgId:link?.orgId||null,generated:new Date(now).toISOString()};
}
module.exports={open,lookup,resolveLibrary,runPanel,rangeLabel,MAX_PANELS};
