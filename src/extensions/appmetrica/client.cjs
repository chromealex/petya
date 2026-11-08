// AppMetrica (Yandex) REST calls: the Reporting API (/stat/v1/data, /stat/v1/data/bytime) and the Management API
// list of applications. Auth: an OAuth token with the «appmetrica:read» permission, `Authorization: OAuth <token>`.
// Quota (AppMetrica docs, «Quotas»): requests per second and per day per token are limited; calls here are sequential.
// Metric and dimension names follow the AppMetrica docs (mobile-api/stat): one namespace per request
// (ym:u: audience, ym:r2: revenue), parametrized revenue metrics take the currency as a request parameter.
const BASE='https://api.appmetrica.yandex.ru';
const CURRENCIES=['RUB','USD','EUR'];
const ID=/^\d{1,12}$/;

function config(s){
 const token=String(s.settings.appmetricaToken||'').trim();
 const apps=String(s.settings.appmetricaApps||'').split(',').map(x=>x.trim()).filter(x=>ID.test(x));
 const currency=CURRENCIES.includes(s.settings.appmetricaCurrency)?s.settings.appmetricaCurrency:'RUB';
 return {token,apps,currency};
}
const connected=settings=>!!String(settings.appmetricaToken||'').trim()&&String(settings.appmetricaApps||'').split(',').some(x=>ID.test(x.trim()));

function explain(error){
 const map={400:'AppMetrica не приняла запрос'+(error.detail?': '+error.detail:'.'),401:'AppMetrica не приняла OAuth-токен. Проверьте его в настройках «AppMetrica».',403:'У токена нет доступа к этому приложению AppMetrica (нужно право appmetrica:read и доступ к приложению).',404:'AppMetrica не нашла приложение. Проверьте ID в настройках «AppMetrica».',429:'AppMetrica ограничила число запросов (квота токена). Повторите позже.'};
 const e=Error(map[error.status]||error.message||'AppMetrica недоступна.');e.status=error.status;e.cause=error;return e;
}
async function api(s,path,query){
 const c=config(s);
 if(!c.token)throw Error('Нет токена AppMetrica.');
 const params=new URLSearchParams();
 for(const [k,v] of Object.entries(query||{}))if(v!==undefined&&v!==null&&v!=='')params.set(k,String(v));
 try{return await s.request(BASE+path+(params.size?'?'+params:''),{method:'GET',headers:{Authorization:'OAuth '+c.token,Accept:'application/json'}});}
 catch(e){
  // The Reporting API explains a refused query in {errors:[{message}]}.
  let detail='';try{detail=JSON.parse(e?.detail||'null')?.errors?.[0]?.message||'';}catch{detail='';}
  throw explain(Object.assign(e,{detail:String(detail).slice(0,200)}));
 }
}

async function applications(s){
 const r=await api(s,'/management/v1/applications');
 const list=Array.isArray(r?.applications)?r.applications:[];
 return list.map(a=>({id:String(a.id),name:String(a.name||a.id)})).filter(a=>ID.test(a.id));
}

// Filters for platform and version in the namespace of the request.
function filters(ns,{platform,version}){
 const parts=[];
 if(platform==='android')parts.push(ns+":operatingSystemInfo=='android'");
 if(platform==='ios')parts.push(ns+":operatingSystemInfo=='iOS'");
 if(version&&/^[\w.+-]{1,40}$/.test(version))parts.push(ns+":appVersion=='"+version+"'");
 return parts.join(' AND ')||undefined;
}

// Daily values of several metrics of one namespace: /stat/v1/data/bytime with group=day.
// The response has one row (no dimensions) with metrics[i][day]; days come from time_intervals when present,
// otherwise they are consecutive from date1.
async function daily(s,{id,metrics,from,to,platform,version,currency}){
 const ns=metrics[0].split(':').slice(0,2).join(':');
 const r=await api(s,'/stat/v1/data/bytime',{id,metrics:metrics.join(','),date1:from,date2:to,group:'day',filters:filters(ns,{platform,version}),currency,accuracy:'full'});
 const row=r?.data?.[0];
 const intervals=Array.isArray(r?.time_intervals)?r.time_intervals.map(x=>String(Array.isArray(x)?x[0]:x).slice(0,10)):null;
 const start=Date.parse(from+'T00:00:00Z');
 return metrics.map((m,i)=>{
  const list=Array.isArray(row?.metrics?.[i])?row.metrics[i]:[];
  return list.map((v,k)=>({date:intervals?.[k]&&/^\d{4}-\d{2}-\d{2}$/.test(intervals[k])?intervals[k]:new Date(start+k*86400000).toISOString().slice(0,10),value:Number(v)})).filter(p=>Number.isFinite(p.value));
 });
}

// Cohorts by install day: active users per (install date, activity date) from the audience namespace.
async function cohorts(s,{id,from,to,platform,version}){
 const extra=filters('ym:u',{platform,version});
 const r=await api(s,'/stat/v1/data',{id,metrics:'ym:u:activeUsers',dimensions:'ym:u:profileInstallDate,ym:u:date',date1:from,date2:to,
  filters:"ym:u:profileInstallDate>='"+from+"'"+(extra?' AND '+extra:''),limit:10000,accuracy:'full'});
 const rows=Array.isArray(r?.data)?r.data:[];
 const by=new Map();
 for(const row of rows){
  const install=String(row?.dimensions?.[0]?.name||row?.dimensions?.[0]?.id||'').slice(0,10),day=String(row?.dimensions?.[1]?.name||row?.dimensions?.[1]?.id||'').slice(0,10),v=Number(row?.metrics?.[0]);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(install)||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(v))continue;
  const offset=Math.round((Date.parse(day)-Date.parse(install))/86400000);
  if(!by.has(install))by.set(install,{date:install,size:0,returned:{}});
  const c=by.get(install);if(offset===0)c.size=v;else if([1,7,30].includes(offset))c.returned[offset]=v;
 }
 // A cohort's day n with nobody active is a real zero once the day is in the requested range.
 const last=Date.parse(to+'T00:00:00Z');
 for(const c of by.values())for(const n of [1,7,30])if(c.returned[n]===undefined&&Date.parse(c.date+'T00:00:00Z')+n*86400000<=last)c.returned[n]=0;
 return [...by.values()].filter(c=>c.size>0).sort((a,b)=>a.date.localeCompare(b.date));
}

async function versions(s,{id,from,to,platform}){
 const r=await api(s,'/stat/v1/data',{id,metrics:'ym:u:activeUsers',dimensions:'ym:u:appVersion',date1:from,date2:to,sort:'-ym:u:activeUsers',limit:6,filters:filters('ym:u',{platform})});
 return (Array.isArray(r?.data)?r.data:[]).map(x=>String(x?.dimensions?.[0]?.name||'')).filter(v=>/^[\w.+-]{1,40}$/.test(v));
}
module.exports={BASE,CURRENCIES,ID,config,connected,api,applications,filters,daily,cohorts,versions,explain};
