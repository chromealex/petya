// Log source «Elasticsearch / OpenSearch» (src/features/log-sources.cjs), read with one search request:
//   POST <url>/<index pattern>/_search   {size, sort, query:{bool:{filter:[range, <KQL as bool>]}}, aggs:<histogram>}
// The query language is a KQL subset parsed by the registry (log-sources `parseKQL`) and compiled here into
// match_phrase / prefix / bool clauses: the model never writes Elasticsearch DSL, there are no scripts, no
// query_string, no other endpoints. Fields follow ECS (`@timestamp`, `message`, `log.level`, `service.name`).
// Auth: an API key (`Authorization: ApiKey <encoded>`, Elasticsearch: create it with only `read` on the log
// indices) or basic user + password (OpenSearch, self-hosted Elasticsearch).
const http=require('./http.cjs');
const NAME='Elasticsearch';
const INDEX=/^(?![_.-])[a-z0-9*_.,-]{1,120}$/;
const TS='@timestamp',MESSAGE='message',LEVEL='log.level',SERVICE='service.name';
const SERVICE_FIELDS=['service.name','kubernetes.labels.app','kubernetes.deployment.name','app'];

const conf=settings=>({
 url:http.base(settings.logsElasticUrl),index:INDEX.test(String(settings.logsElasticIndex||'').trim())?String(settings.logsElasticIndex).trim():'logs-*',
 user:String(settings.logsElasticUser||'').trim(),key:String(settings.logsElasticKey||'').trim(),kibana:http.base(settings.logsKibanaUrl)
});
function headers(c){
 const h={Accept:'application/json','Content-Type':'application/json'};
 if(c.user&&c.key)h.Authorization=http.basic(c.user,c.key);else if(c.key)h.Authorization='ApiKey '+c.key;
 return h;
}
const q=v=>'"'+String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
const LEVEL_WORDS={error:['error','ERROR','err'],fatal:['fatal','FATAL','critical','CRITICAL'],warn:['warn','WARN','warning','WARNING'],info:['info','INFO'],debug:['debug','DEBUG','trace']};
// Structured filters → KQL, which the registry validates like any other query.
function compile(f){
 const parts=[];
 if(f.services?.length)parts.push('('+SERVICE_FIELDS.map(field=>field+':('+f.services.map(q).join(' or ')+')').join(' or ')+')');
 if(f.levels?.length)parts.push(LEVEL+':('+[...new Set(f.levels.flatMap(l=>LEVEL_WORDS[l]))].map(q).join(' or ')+')');
 for(const w of f.contains||[])parts.push(q(w));
 for(const w of f.exclude||[])parts.push('not '+q(w));
 return parts.join(' and ');
}
// The KQL tree → a bool query of match_phrase and prefix clauses.
function dsl(node,field){
 if(!node)return {match_all:{}};
 if(node.and)return {bool:{filter:node.and.map(n=>dsl(n,field))}};
 if(node.or)return {bool:{should:node.or.map(n=>dsl(n,field)),minimum_should_match:1}};
 if(node.not)return {bool:{must_not:[dsl(node.not,field)]}};
 if(node.field)return dsl(node.expr,node.field);
 const target=field||MESSAGE;
 if(node.prefix!==undefined)return {prefix:{[target]:{value:node.prefix}}};
 return {match_phrase:{[target]:node.phrase}};
}
const pick=(o,key)=>{if(!o||typeof o!=='object')return undefined;if(o[key]!==undefined)return o[key];const [head,...rest]=key.split('.');return rest.length?pick(o[head],rest.join('.')):undefined;};
const LABELS=['service.name','log.level','level','severity','host.name','kubernetes.namespace','kubernetes.pod.name','kubernetes.labels.app','container.name','trace.id','event.dataset','app'];

function body(spec,step){
 const L=require('../../features/log-sources.cjs');
 const parsed=L.parseKQL(spec.query);
 if(!parsed.ok)throw Error('Запрос KQL не прошёл проверку: '+parsed.error);
 return {size:spec.limit,track_total_hits:100000,timeout:'25s',sort:[{[TS]:{order:'desc',unmapped_type:'date'}}],
  query:{bool:{filter:[{range:{[TS]:{gte:spec.range.from,lte:spec.range.to,format:'strict_date_optional_time'}}},dsl(parsed.tree)]}},
  aggs:{timeline:{date_histogram:{field:TS,fixed_interval:Math.round(step/1000)+'s',min_doc_count:0,extended_bounds:{min:Date.parse(spec.range.from),max:Date.parse(spec.range.to)}},
   aggs:{errors:{filter:{terms:{[LEVEL]:[...LEVEL_WORDS.error,...LEVEL_WORDS.fatal]}}}}}}};
}
// Rison string for a Kibana URL: ' → !' and ! → !!.
const rison=v=>"'"+String(v).replace(/!/g,'!!').replace(/'/g,"!'")+"'";

module.exports={
 id:'elasticsearch',name:'Elasticsearch / OpenSearch',language:'kql',
 names:[/(?:^|[^\p{L}])(?:kibana|кибан\p{L}*|elastic(?:search)?|эластик\p{L}*|opensearch|опенсерч\p{L}*|elk)(?=$|[^\p{L}])/iu],
 maxRangeHours:7*24,maxLimit:1000,
 prompt:'Поля: '+SERVICE+' (сервис), '+LEVEL+' (уровень), '+MESSAGE+' (текст).',
 ready:settings=>!!conf(settings).url,
 hint:settings=>conf(settings).url?'':'Адрес Elasticsearch или OpenSearch — в настройках «Логи сервера».',
 compile,
 async search(s,spec,{check}={}){
  const c=conf(s.settings);
  const L=require('../../features/log-sources.cjs');
  const step=L.stepFor(Date.parse(spec.range.from),Date.parse(spec.range.to));
  let r;
  try{r=await s.request(c.url+'/'+encodeURIComponent(c.index).replace(/%2A/g,'*').replace(/%2C/g,',')+'/_search',{method:'POST',headers:headers(c),body:JSON.stringify(body(spec,step)),timeoutMs:30000});}
  catch(e){throw http.explain(NAME,e,{where:'индекс '+c.index});}
  check?.();
  if(!r||typeof r!=='object'||!Array.isArray(r.hits?.hits))throw Error(NAME+' вернул некорректный ответ.');
  const entries=r.hits.hits.map(h=>{
   const src=h._source||{};
   const labels={};for(const k of LABELS){const v=pick(src,k);if(v!=null&&typeof v!=='object')labels[k]=String(v);}
   const msg=pick(src,MESSAGE)??pick(src,'log.original')??pick(src,'event.original')??pick(src,'error.message')??'';
   return {ts:pick(src,TS)??pick(src,'timestamp'),message:typeof msg==='string'?msg:JSON.stringify(msg),level:pick(src,LEVEL)??pick(src,'level')??pick(src,'severity'),
    service:SERVICE_FIELDS.map(f=>pick(src,f)).find(v=>v!=null&&typeof v!=='object')??'',labels};
  });
  const b=r.aggregations?.timeline?.buckets;
  const histogram=Array.isArray(b)?{step,buckets:b.map(x=>({t:x.key,total:x.doc_count,errors:x.errors?.doc_count||0}))}:null;
  const total=typeof r.hits.total==='number'?r.hits.total:r.hits.total?.value;
  const notes=r.timed_out?[NAME+' не успел просмотреть все индексы за 25 с — данные неполные.']:[];
  if(r._shards?.failed)notes.push(NAME+': часть шардов не ответила ('+r._shards.failed+').');
  return {entries,histogram,total,truncated:r.hits.total?.relation==='gte'||entries.length<(total||0),notes};
 },
 // Kibana Discover with the same KQL and period (the default data view).
 explore(settings,spec){
  const c=conf(settings);
  if(!c.kibana)return null;
  return {label:'Открыть в Kibana',url:c.kibana+"/app/discover#/?_g=(time:(from:"+rison(spec.range.from)+',to:'+rison(spec.range.to)+'))&_a=(query:(language:kuery,query:'+encodeURIComponent(rison(spec.query))+'))'};
 },
 conf,dsl,body,INDEX
};
