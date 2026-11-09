// Log source «Loki» (src/features/log-sources.cjs), read through the Loki HTTP API:
//   GET <url>/loki/api/v1/query_range?query=<LogQL>&start=<ns>&end=<ns>&limit=<n>&direction=backward  (lines)
//   GET <url>/loki/api/v1/query_range?query=sum(count_over_time(<LogQL>[<step>]))&step=<s>             (histogram)
//   GET <url>/loki/api/v1/label/<service label>/values                                               (services)
// Auth: basic (user + password/token, Grafana Cloud: instance id + access policy token) or a bearer token;
// `X-Scope-OrgID` for multi-tenant Loki. Only these read endpoints are ever called; queries are LogQL log queries
// checked by the registry (no metric queries from the model, no templates) and bounded in time and size.
const http=require('./http.cjs');
const NAME='Loki';
const LABEL=/^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

const conf=settings=>({
 url:http.base(settings.logsLokiUrl),user:String(settings.logsLokiUser||'').trim(),token:String(settings.logsLokiToken||'').trim(),
 tenant:String(settings.logsLokiTenant||'').trim(),selector:String(settings.logsLokiSelector||'').trim(),
 label:LABEL.test(String(settings.logsLokiServiceLabel||'').trim())?String(settings.logsLokiServiceLabel).trim():'service_name',
 grafana:http.base(settings.logsGrafanaUrl),datasource:String(settings.logsGrafanaDatasource||'').trim()
});
function headers(c){
 const h={Accept:'application/json'};
 if(c.user&&c.token)h.Authorization=http.basic(c.user,c.token);else if(c.token)h.Authorization='Bearer '+c.token;
 if(c.tenant)h['X-Scope-OrgID']=c.tenant;
 return h;
}
const quote=v=>'"'+String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
const escapeRe=v=>String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const ERRORS='(?i)\\b(error|err|fatal|panic|exception|critical)\\b';
const LEVEL_RE={error:'error|err|exception',fatal:'fatal|panic|critical',warn:'warn|warning',info:'info',debug:'debug|trace'};

// Structured filters → a LogQL log query. Services become the selector; levels and words become line filters.
function compile(f,settings={}){
 const c=conf(settings);
 const svc=(f.services||[]).map(escapeRe);
 let q=svc.length?'{'+c.label+(svc.length===1?'='+quote(f.services[0]):'=~'+quote(svc.join('|')))+'}':(require('../../features/log-sources.cjs').validateLogQL(c.selector).ok?c.selector:'{'+c.label+'=~".+"}');
 if(f.levels?.length){const words=[...new Set(f.levels.flatMap(l=>LEVEL_RE[l].split('|')))];q+=' |~ '+quote('(?i)\\b('+words.join('|')+')\\b');}
 for(const w of f.contains||[])q+=' |~ '+quote('(?i)'+escapeRe(w));
 for(const w of f.exclude||[])q+=' !~ '+quote('(?i)'+escapeRe(w));
 return q;
}
async function get(s,c,pathAndQuery,check){
 try{const r=await s.request(c.url+pathAndQuery,{headers:headers(c),timeoutMs:30000});check?.();return r;}
 catch(e){throw http.explain(NAME,e);}
}
const ns=iso=>String(Date.parse(iso))+'000000';
// The JSON a line may carry: a few top-level fields become labels (level, service, trace id).
function fields(line){
 if(!/^\s*\{/.test(line))return {};
 try{const o=JSON.parse(line);const out={};for(const k of ['level','severity','service','app','trace_id','traceId','logger'])if(o&&o[k]!=null&&typeof o[k]!=='object')out[k]=String(o[k]);return out;}catch{return {};}
}

module.exports={
 id:'loki',name:NAME,language:'logql',
 names:[/(?:^|[^\p{L}])(?:loki|локи|grafana|графан\p{L}*)(?=$|[^\p{L}])/iu],
 maxRangeHours:7*24,maxLimit:1000,
 prompt:'Сервис выбирай меткой {service_name="…"}, если сервис назван; иначе используй селектор по умолчанию.',
 ready:settings=>!!conf(settings).url,
 hint:settings=>conf(settings).url?'':'Адрес Loki — в настройках «Логи сервера».',
 compile,
 // The default selector the user saved is also checked: a log query only.
 validate(query){return require('../../features/log-sources.cjs').validateLogQL(query);},
 async search(s,spec,{check}={}){
  const c=conf(s.settings);
  const L=require('../../features/log-sources.cjs');
  const q=new URLSearchParams({query:spec.query,start:ns(spec.range.from),end:ns(spec.range.to),limit:String(spec.limit),direction:'backward'});
  const r=await get(s,c,'/loki/api/v1/query_range?'+q,check);
  if(r?.status&&r.status!=='success')throw Error('Loki вернул ошибку: '+String(r.error||r.status).slice(0,200));
  const result=r?.data?.result;
  if(r?.data?.resultType!=='streams'||!Array.isArray(result))throw Error('Loki вернул не строки логов: нужен запрос строк, а не метрика.');
  const entries=[];
  for(const stream of result){
   const labels=stream?.stream&&typeof stream.stream==='object'?stream.stream:{};
   for(const v of Array.isArray(stream?.values)?stream.values:[]){
    if(!Array.isArray(v)||v.length<2)continue;
    const line=String(v[1]??'');const extra=fields(line);
    const meta=v[2]&&typeof v[2]==='object'?{...v[2].structuredMetadata,...v[2].parsed}:{};
    entries.push({ts:Number(String(v[0]).slice(0,13)),message:line,labels:{...extra,...meta,...labels}});
   }
  }
  // Exact counts over the whole period (the lines above stop at the limit): all matching lines and error lines.
  let histogram=null,total=null;
  const step=L.stepFor(Date.parse(spec.range.from),Date.parse(spec.range.to));
  const metric=expr=>new URLSearchParams({query:'sum(count_over_time('+expr+' ['+Math.round(step/1000)+'s]))',start:ns(spec.range.from),end:ns(spec.range.to),step:Math.round(step/1000)+'s'});
  try{
   const [all,errs]=await Promise.all([get(s,c,'/loki/api/v1/query_range?'+metric(spec.query),check),get(s,c,'/loki/api/v1/query_range?'+metric(spec.query+' |~ '+quote(ERRORS)),check)]);
   const series=x=>new Map(((x?.data?.result||[])[0]?.values||[]).map(([t,v])=>[Number(t)*1000-step,Number(v)||0]));
   const a=series(all),b=series(errs);
   if(a.size){
    histogram={step,buckets:[...a.entries()].sort((x,y)=>x[0]-y[0]).map(([t,v])=>({t:new Date(t).toISOString(),total:v,errors:Math.min(v,b.get(t)||0)}))};
    total=[...a.values()].reduce((x,y)=>x+y,0);
   }
  }catch(e){if(e?.status===401||e?.status===403)throw e;/* counts are optional: the lines are shown anyway */}
  return {entries,histogram,total,truncated:entries.length>=spec.limit};
 },
 async services(s,spec){
  const c=conf(s.settings);
  const r=await get(s,c,'/loki/api/v1/label/'+encodeURIComponent(c.label)+'/values?'+new URLSearchParams({start:ns(spec.range.from),end:ns(spec.range.to)}));
  return Array.isArray(r?.data)?r.data:[];
 },
 // Grafana Explore with the same query and period (the datasource uid comes from the settings).
 explore(settings,spec){
  const c=conf(settings);
  if(!c.grafana)return null;
  const pane={datasource:c.datasource||undefined,queries:[{refId:'A',expr:spec.query,queryType:'range',...(c.datasource?{datasource:{type:'loki',uid:c.datasource}}:{})}],range:{from:String(Date.parse(spec.range.from)),to:String(Date.parse(spec.range.to))}};
  return {label:'Открыть в Grafana',url:c.grafana+'/explore?schemaVersion=1&panes='+encodeURIComponent(JSON.stringify({a:pane}))+'&orgId=1'};
 },
 conf,compile,headers
};
