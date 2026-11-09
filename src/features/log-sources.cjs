// Log sources: services that can search server logs (Loki, Elasticsearch/OpenSearch, Kubernetes pod logs, …).
// Petya itself knows no log service. An extension declares in its extension.json
//   "provides": { "log-source": "<file>.cjs" }   (or a list of files)
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`), and each file exports
//   { id, name, language:'logql'|'kql'|'text', ready(settings) -> bool, hint?(settings) -> text,
//     names?: [RegExp],                               // how a request names this source («в Loki», «в Кибане»)
//     maxRangeHours?, maxLimit?,                      // the source's own caps (never above the registry's)
//     prompt?: text,                                  // what the model must know to write this source's query
//     compile(filters, settings) -> query,            // structured filters → a query in the source's language
//     validate?(query) -> {ok, query?, error?},       // a stricter check than the registry's language check
//     async search(services, spec, {check}) -> {entries, histogram?, total?, truncated?, notes?},
//     async services?(services, spec) -> [name],      // service names for a clarification («какой сервис?»)
//     explore?(settings, spec) -> {label, url} | null }  // «Открыть в Grafana/Kibana»
// The spec every source receives is bounded here (see `bound`): {source, language, query, filters:{levels,
// services, contains, exclude}, range:{from, to} (ISO, capped), limit (capped), notes}. A source only reads: the
// registry never passes anything that writes, and each source talks to one fixed read endpoint.
// Entries come back in one shape (see `entry`): {ts, level, service, message, labels, source}. `service` is the
// normalized service name (k8s app/deployment labels, Loki `service_name`/`app`/`job`, ECS `service.name`), the
// key other apps (monitoring, anomalies) use to ask for one service's logs.
// Helpers for consumers: `histogram`, `signature` (a message with numbers and ids normalized), `groups` (error
// signatures with counts and first/last seen), `parse` (a model-free reading of a Russian request), `translate`
// (the model writes the query under a strict schema; `bound` still validates it).
const path=require('node:path');
const KIND='log-source';
const LANGUAGES=['logql','kql','text'];
const LEVELS=['fatal','error','warn','info','debug'];
const CAPS={limit:200,maxLimit:1000,rangeMs:3600e3,maxRangeMs:7*86400e3,minRangeMs:60e3,query:600,filter:80,filters:8};

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  const bad=()=>Error('Invalid log source '+x.extension+'/'+x.file);
  if(typeof p.ready!=='function'||typeof p.search!=='function'||typeof p.compile!=='function'||!LANGUAGES.includes(p.language))throw bad();
  for(const hook of ['validate','services','explore','hint'])if(p[hook]!==undefined&&typeof p[hook]!=='function')throw bad();
  if(p.names!==undefined&&(!Array.isArray(p.names)||p.names.some(r=>!(r instanceof RegExp))))throw bad();
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name||x.name,source:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

// --- Small normalizers ------------------------------------------------------------------------------------------
const text=(v,max=300)=>String(v??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const time=v=>{
 if(typeof v==='number'||/^\d{13,19}$/.test(String(v))){const n=Number(String(v).slice(0,13));return Number.isFinite(n)&&n>0?new Date(n).toISOString():null;}
 const t=Date.parse(v);return Number.isFinite(t)?new Date(t).toISOString():null;
};
const LEVEL_WORDS=[['fatal',/^(?:fatal|panic|crit(?:ical)?|emerg(?:ency)?|alert|f)$/i],['error',/^(?:error|err|e|severe|exception)$/i],['warn',/^(?:warn(?:ing)?|w)$/i],['info',/^(?:info(?:rmation)?|notice|i)$/i],['debug',/^(?:debug|trace|verbose|d|t)$/i]];
function levelName(v){const s=String(v??'').trim();if(!s)return '';if(/^\d+$/.test(s)){const n=Number(s);return n>=60?'fatal':n>=50?'error':n>=40?'warn':n>=30?'info':'debug';}for(const [name,re] of LEVEL_WORDS)if(re.test(s))return name;return '';}
// The level of a raw line: a level label, a JSON or logfmt field, then a keyword in the text.
function levelOf(message,labels={}){
 for(const k of ['level','detected_level','severity','lvl','log.level','loglevel'])if(labels[k]){const l=levelName(labels[k]);if(l)return l;}
 const m=String(message||'');
 const field=/"(?:level|severity|lvl|log\.level)"\s*:\s*"?([A-Za-z]+|\d+)/i.exec(m)||/(?:^|\s)(?:level|lvl|severity)=["']?([A-Za-z]+)/i.exec(m);
 if(field){const l=levelName(field[1]);if(l)return l;}
 if(/\b(?:FATAL|PANIC|CRITICAL|CRIT)\b|panic:/.test(m))return 'fatal';
 if(/\b(?:ERROR|ERR|SEVERE)\b|\bE\d{4} |Traceback \(most recent|Exception\b|\bException:|\berror:/i.test(m)&&!/\b(?:0|no) errors?\b/i.test(m))return 'error';
 if(/\bWARN(?:ING)?\b/i.test(m))return 'warn';
 if(/\bDEBUG\b|\bTRACE\b/.test(m))return 'debug';
 return 'info';
}
// The service an entry belongs to, from whatever labels the source has. Namespaced job names («prod/api») keep
// only the last part; pod names are not services (the k8s source passes the owning workload as `app`).
const SERVICE_KEYS=['service','service_name','service.name','app','app.kubernetes.io/name','k8s-app','application','container','container_name','job'];
function serviceOf(labels={}){
 for(const k of SERVICE_KEYS){const v=text(labels[k],120);if(v)return v.split('/').pop();}
 return '';
}
// One entry in the shape every consumer reads.
function entry(raw,source){
 const labels={};
 for(const [k,v] of Object.entries(raw?.labels&&typeof raw.labels==='object'?raw.labels:{}).slice(0,24))if(/^[\w.@/-]{1,80}$/.test(k)&&v!=null&&typeof v!=='object')labels[k]=text(v,200);
 const message=String(raw?.message??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').replace(/\s+$/,'').slice(0,4000);
 return {ts:time(raw?.ts),level:LEVELS.includes(raw?.level)?raw.level:levelName(raw?.level)||levelOf(message,labels),service:text(raw?.service,120)||serviceOf(labels),message,labels,source};
}

// --- Ranges -----------------------------------------------------------------------------------------------------
const UNIT={m:60e3,min:60e3,h:3600e3,d:86400e3,w:7*86400e3};
function duration(v){const m=/^\s*(\d{1,4})\s*(m|min|h|d|w)\s*$/i.exec(String(v||''));return m?Number(m[1])*UNIT[m[2].toLowerCase()]:0;}
function range(raw,{now=Date.now(),maxMs=CAPS.maxRangeMs}={},notes=[]){
 const end=Math.min(now,Date.parse(raw?.to)||now);
 let start=Date.parse(raw?.from);
 const last=duration(raw?.last);
 if(last)start=end-last;
 if(!Number.isFinite(start)||start>=end){if(raw&&(raw.from||raw.last))notes.push('Период непонятен — взят последний час.');start=end-CAPS.rangeMs;}
 if(end-start>maxMs){start=end-maxMs;notes.push('Период сокращён до '+Math.round(maxMs/3600e3)+' ч — больше этот источник за раз не читает.');}
 if(end-start<CAPS.minRangeMs)start=end-CAPS.minRangeMs;
 return {from:new Date(start).toISOString(),to:new Date(end).toISOString()};
}

// --- Query languages: what the registry lets through -------------------------------------------------------------
// LogQL, log queries only: a stream selector and line/label filters, json/logfmt parsers. Metric queries, templates
// and anything else are refused; strings are bounded and regexes must compile (RE2-incompatible lookarounds and
// backreferences are refused too).
function validateLogQL(q){
 const s=String(q||'').trim();
 if(!s)return {ok:false,error:'пустой запрос'};
 if(s.length>CAPS.query)return {ok:false,error:'слишком длинный запрос'};
 let i=0;const ws=()=>{while(/\s/.test(s[i]||''))i++;};
 const string=()=>{
  ws();const q0=s[i];if(q0!=='"'&&q0!=='`')return null;
  let out='';i++;
  while(i<s.length&&s[i]!==q0){if(q0==='"'&&s[i]==='\\'){out+=s[i]+(s[i+1]||'');i+=2;continue;}out+=s[i++];}
  if(s[i]!==q0)return null;i++;return out.length>200?null:out;
 };
 const regexOk=r=>{if(/\(\?[=!<]|\\[1-9]/.test(r))return false;try{new RegExp(r.replace(/^\(\?i\)/,''));return true;}catch{return false;}};
 const ident=()=>{ws();const m=/^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));if(!m)return null;i+=m[0].length;return m[0];};
 const op=list=>{ws();for(const o of list)if(s.startsWith(o,i)){i+=o.length;return o;}return null;};
 ws();if(s[i]!=='{')return {ok:false,error:'нужен селектор потока {…}'};i++;
 let strong=0,count=0;
 for(;;){
  const name=ident();if(!name)return {ok:false,error:'ошибка в селекторе'};
  const o=op(['=~','!~','!=','=']);if(!o)return {ok:false,error:'ошибка в селекторе'};
  const v=string();if(v===null)return {ok:false,error:'ошибка в селекторе'};
  if((o==='=~'||o==='!~')&&!regexOk(v))return {ok:false,error:'неверное регулярное выражение'};
  if(o==='='&&v||o==='=~'&&!/^(?:\.\*|)$/.test(v))strong++;
  if(++count>10)return {ok:false,error:'слишком много меток'};
  ws();if(s[i]===','){i++;continue;}
  if(s[i]==='}'){i++;break;}
  return {ok:false,error:'ошибка в селекторе'};
 }
 if(!strong)return {ok:false,error:'селектор должен выбирать хотя бы одну метку'};
 let stages=0;
 for(;;){
  ws();if(i>=s.length)break;
  if(++stages>12)return {ok:false,error:'слишком много фильтров'};
  const line=op(['|=','!=','|~','!~']);
  if(line){const v=string();if(v===null)return {ok:false,error:'фильтр строки должен быть строкой в кавычках'};if(line.endsWith('~')&&!regexOk(v))return {ok:false,error:'неверное регулярное выражение'};continue;}
  if(s[i]!=='|')return {ok:false,error:'допустимы только фильтры строк и меток'};
  i++;
  const word=ident();
  if(word==='json'||word==='logfmt'){ws();if(s[i]&&s[i]!=='|'&&s[i]!=='!')return {ok:false,error:'параметры '+word+' не поддерживаются'};continue;}
  if(!word||/^(?:line_format|label_format|unwrap|decolorize|pattern|regexp|drop|keep|distinct)$/.test(word))return {ok:false,error:'этап «'+(word||s.slice(i,i+10))+'» не поддерживается'};
  const o=op(['=~','!~','!=','>=','<=','==','=','>','<']);if(!o)return {ok:false,error:'ошибка в фильтре меток'};
  ws();
  if(s[i]==='"'||s[i]==='`'){const v=string();if(v===null)return {ok:false,error:'ошибка в фильтре меток'};if(o.includes('~')&&!regexOk(v))return {ok:false,error:'неверное регулярное выражение'};}
  else{const m=/^-?\d+(?:\.\d+)?(?:ms|s|m|h|[KMG]i?B|B)?/.exec(s.slice(i));if(!m)return {ok:false,error:'ошибка в фильтре меток'};i+=m[0].length;}
 }
 return {ok:true,query:s};
}
// KQL subset (Kibana Query Language) parsed into a tree the Elasticsearch source compiles to a bool query itself:
// field:value, field:"phrase", field:(a or b), free words and phrases, and/or/not, parentheses. No ranges,
// no leading wildcards, no nested queries; depth and size are bounded.
function parseKQL(q){
 const s=String(q||'').trim();
 if(!s)return {ok:true,query:'',tree:null};
 if(s.length>CAPS.query)return {ok:false,error:'слишком длинный запрос'};
 const tokens=[];let i=0;
 while(i<s.length){
  const c=s[i];
  if(/\s/.test(c)){i++;continue;}
  if(c==='('||c===')'||c===':'){tokens.push({t:c});i++;continue;}
  if(c==='"'){let v='';i++;while(i<s.length&&s[i]!=='"'){if(s[i]==='\\'){v+=s[i+1]||'';i+=2;continue;}v+=s[i++];}if(s[i]!=='"')return {ok:false,error:'незакрытая кавычка'};i++;if(v.length>200)return {ok:false,error:'слишком длинная фраза'};tokens.push({t:'phrase',v});continue;}
  const m=/^[^\s():"<>{}\\]+/.exec(s.slice(i));
  if(!m)return {ok:false,error:'недопустимый символ «'+c+'»'};
  const w=m[0];i+=w.length;
  if(/^(?:and|or|not)$/i.test(w))tokens.push({t:w.toLowerCase()});else tokens.push({t:'word',v:w});
 }
 if(tokens.length>60)return {ok:false,error:'слишком сложный запрос'};
 let p=0,terms=0;
 const peek=()=>tokens[p]?.t;
 const value=()=>{const k=tokens[p];if(!k||k.t!=='word'&&k.t!=='phrase')throw Error('ожидалось значение');p++;
  if(k.t==='word'&&/^\*/.test(k.v))throw Error('шаблон в начале слова не поддерживается');
  if(k.t==='word'&&/\*./.test(k.v))throw Error('шаблон допустим только в конце слова');
  if(++terms>20)throw Error('слишком много условий');
  return k.t==='word'&&k.v.endsWith('*')?{prefix:k.v.slice(0,-1)}:{phrase:k.v};};
 const or=(depth,inner)=>{let left=and(depth,inner);while(peek()==='or'){p++;left={or:[left,and(depth,inner)]};}return left;};
 const and=(depth,inner)=>{let left=not(depth,inner);while(peek()&&peek()!==')'&&peek()!=='or'){if(peek()==='and')p++;left={and:[left,not(depth,inner)]};}return left;};
 const not=(depth,inner)=>{if(peek()==='not'){p++;return {not:not(depth,inner)};}return primary(depth,inner);};
 const primary=(depth,inner)=>{
  if(depth>5)throw Error('слишком глубокая вложенность');
  if(peek()==='('){p++;const e=or(depth+1,inner);if(peek()!==')')throw Error('нет закрывающей скобки');p++;return e;}
  const k=tokens[p];
  if(!inner&&k?.t==='word'&&tokens[p+1]?.t===':'){
   if(!/^[A-Za-z_@][\w.@-]{0,80}$/.test(k.v))throw Error('недопустимое поле «'+k.v+'»');
   p+=2;
   if(peek()==='('){p++;const e=or(depth+1,true);if(peek()!==')')throw Error('нет закрывающей скобки');p++;return {field:k.v,expr:e};}
   return {field:k.v,expr:value()};
  }
  return value();
 };
 try{
  const tree=or(0,false);
  if(p!==tokens.length)throw Error('лишнее в запросе: «'+(tokens[p].v||tokens[p].t)+'»');
  return {ok:true,query:s,tree};
 }catch(e){return {ok:false,error:e.message};}
}
function validateQuery(language,q){
 if(language==='logql')return validateLogQL(q);
 if(language==='kql'){const r=parseKQL(q);return r.ok?{ok:true,query:r.query}:r;}
 const s=text(q,200);return {ok:true,query:s};
}

// --- The bounded spec -------------------------------------------------------------------------------------------
const SERVICE=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,62}$/;
function list(v,test,max=CAPS.filters){return [...new Set((Array.isArray(v)?v:v?[v]:[]).map(x=>text(x,CAPS.filter)).filter(x=>x&&test(x)))].slice(0,max);}
// Everything a model, a card or another app asks for passes through here before any source sees it.
function bound(raw,source,{now=Date.now(),settings={}}={}){
 const p=source.source||source;
 const notes=[];
 const maxMs=Math.min(CAPS.maxRangeMs,(Number(p.maxRangeHours)||Infinity)*3600e3);
 const maxLimit=Math.min(CAPS.maxLimit,Number(p.maxLimit)||CAPS.maxLimit);
 const filters={
  levels:list(raw?.filters?.levels??raw?.levels,x=>LEVELS.includes(x)),
  services:list(raw?.filters?.services??raw?.services,x=>SERVICE.test(x)),
  contains:list(raw?.filters?.contains??raw?.contains,x=>x.length>=2),
  exclude:list(raw?.filters?.exclude??raw?.exclude,x=>x.length>=2)
 };
 let limit=Math.round(Number(raw?.limit));
 if(!Number.isFinite(limit)||limit<1)limit=Math.min(CAPS.limit,maxLimit);
 if(limit>maxLimit){limit=maxLimit;notes.push('Показываю не больше '+maxLimit+' строк.');}
 let query=typeof raw?.query==='string'?raw.query.trim():'';
 if(query){
  let check=validateQuery(p.language,query);
  if(check.ok&&typeof p.validate==='function'){try{check=p.validate(query,settings)||{ok:false,error:'источник отклонил запрос'};}catch(e){check={ok:false,error:e.message};}}
  if(!check.ok){notes.push('Запрос «'+text(query,120)+'» не прошёл проверку ('+check.error+') — собран заново из фильтров.');query='';}
  else query=check.query??query;
 }
 if(!query){try{query=String(p.compile(filters,settings)||'');}catch(e){query='';notes.push(e.message);}}
 return {source:p.id||source.id,language:p.language,query,filters,range:range(raw?.range||raw,{now,maxMs},notes),limit,notes};
}

// --- Histogram and error signatures ------------------------------------------------------------------------------
const STEPS=[60e3,300e3,600e3,900e3,1800e3,3600e3,3*3600e3,6*3600e3,12*3600e3,86400e3];
const stepFor=(from,to,buckets=48)=>STEPS.find(s=>(to-from)/s<=buckets)||86400e3;
function histogram(entries,spec,{step}={}){
 const from=Date.parse(spec.range.from),to=Date.parse(spec.range.to);
 step=step||stepFor(from,to);
 const first=Math.floor(from/step)*step,n=Math.max(1,Math.ceil((to-first)/step));
 const buckets=Array.from({length:n},(_,k)=>({t:new Date(first+k*step).toISOString(),total:0,errors:0,warns:0}));
 for(const e of entries){const t=Date.parse(e.ts);if(!Number.isFinite(t))continue;const k=Math.floor((t-first)/step);if(k<0||k>=n)continue;const b=buckets[k];b.total++;if(e.level==='error'||e.level==='fatal')b.errors++;else if(e.level==='warn')b.warns++;}
 return {step,buckets,exact:false};
}
// A source's own counts (all matching lines, not only the returned ones) in the same shape.
function sourceHistogram(raw,spec){
 if(!raw||!Array.isArray(raw.buckets)||!raw.buckets.length)return null;
 const step=Number(raw.step);if(!Number.isFinite(step)||step<1000)return null;
 const buckets=raw.buckets.slice(0,500).map(b=>({t:time(b.t),total:Math.max(0,Math.round(Number(b.total)||0)),errors:Math.max(0,Math.round(Number(b.errors)||0)),warns:Math.max(0,Math.round(Number(b.warns)||0))})).filter(b=>b.t).sort((a,b)=>a.t.localeCompare(b.t));
 return buckets.length?{step,buckets,exact:true}:null;
}
// The message with the parts that differ between occurrences replaced: ids, numbers, addresses, times.
function signature(message){
 let m=String(message||'');
 const json=/^\s*\{/.test(m)&&(()=>{try{return JSON.parse(m);}catch{return null;}})();
 if(json&&typeof json==='object'){const v=json.msg??json.message??json.error??json.err;if(v)m=typeof v==='string'?v:JSON.stringify(v);}
 else{const f=/(?:^|\s)(?:msg|message)=(?:"((?:[^"\\]|\\.)*)"|(\S+))/.exec(m);if(f)m=(f[1]??f[2]).replace(/\\"/g,'"');}
 return m
  .replace(/^\s*\[?\d{4}-\d{2}-\d{2}[T ][\d:.,]+(?:Z|[+-]\d{2}:?\d{2})?\]?\s*/,'')
  .replace(/\b\d{4}-\d{2}-\d{2}(?:[T ][\d:.,]+(?:Z|[+-]\d{2}:?\d{2})?)?/g,'<time>')
  .replace(/\b\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?\b/g,'<time>')
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,'<uuid>')
  .replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g,'<email>')
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g,'<ip>')
  .replace(/\b(?:0x)?[0-9a-f]{8,}\b/gi,w=>/\d/.test(w)?'<hex>':w)
  .replace(/\b[A-Za-z]*\d[A-Za-z\d_-]{9,}\b/g,'<id>')
  .replace(/(?<![A-Za-z<])\d+(?:[.,]\d+)?(?:ms|s|m|h|kb|mb|gb|b|%)?(?![A-Za-z])/gi,'<n>')
  .replace(/(?:<n>[\s,./:-]*){2,}/g,'<n> ')
  .replace(/\s+/g,' ').trim().slice(0,200);
}
// Error lines grouped by signature: the most frequent first. Warnings are grouped only when there are no errors.
function groups(entries,{levels,max=20}={}){
 const errs=entries.filter(e=>e.level==='error'||e.level==='fatal');
 const pick=levels?entries.filter(e=>levels.includes(e.level)):errs.length?errs:entries.filter(e=>e.level==='warn');
 const map=new Map();
 for(const e of pick){
  const sig=signature(e.message);if(!sig)continue;
  let g=map.get(sig);
  if(!g){g={signature:sig,count:0,level:e.level,first:e.ts,last:e.ts,services:new Set(),samples:[]};map.set(sig,g);}
  g.count++;if(e.level==='fatal')g.level='fatal';
  if(e.ts&&(!g.first||e.ts<g.first))g.first=e.ts;
  if(e.ts&&(!g.last||e.ts>g.last))g.last=e.ts;
  if(e.service)g.services.add(e.service);
  if(g.samples.length<5&&!g.samples.includes(e.message))g.samples.push(e.message.slice(0,1000));
 }
 return [...map.values()].sort((a,b)=>b.count-a.count||String(b.last).localeCompare(String(a.last))).slice(0,max).map(g=>({...g,services:[...g.services].slice(0,6)}));
}

// --- Reading a request ------------------------------------------------------------------------------------------
// Model-free: the period, levels, «сервис X», quoted text and Latin words. Subject words in Russian («оплаты»)
// need the model to become a query in the logs' language.
const STOP=new Set(['loki','grafana','kibana','elastic','elasticsearch','opensearch','kubectl','kubernetes','k8s','logql','kql','logs','log','error','errors','warn','warning','info','debug','prod','production','staging','pod','pods','the','in','last','hour','grep','service','server']);
function parse(textIn,now=new Date()){
 const t=String(textIn||'');
 const out={levels:[],services:[],contains:[],range:{last:'1h'},period:true};
 const p=/(?:за|в течение)\s+(?:последн\p{L}*\s+)?(\d{1,3})?\s*(минут\p{L}*|мин|час\p{L}*|ч|сут\p{L}*|дн\p{L}*|день|недел\p{L}*)/iu.exec(t);
 if(p){const k=Number(p[1])||1,u=p[2].toLowerCase();out.range={last:/^мин/.test(u)?k+'m':/^ч|^час/.test(u)?k+'h':/^недел/.test(u)?(7*k)+'d':k+'d'};}
 else if(/полчаса/iu.test(t))out.range={last:'30m'};
 else if(/сегодня/iu.test(t)){const d=new Date(now);d.setHours(0,0,0,0);out.range={from:d.toISOString(),to:new Date(now).toISOString()};}
 else if(/вчера/iu.test(t)){const d=new Date(now);d.setHours(0,0,0,0);out.range={from:new Date(d.getTime()-86400e3).toISOString(),to:d.toISOString()};}
 else out.period=false;
 if(/ошиб\p{L}*|(?:^|[^\p{L}])(?:errors?|exceptions?|исключени\p{L}*|эксепшн\p{L}*|падени\p{L}*|5\d\d)(?=$|[^\p{L}\d])/iu.test(t))out.levels=['error','fatal'];
 else if(/предупрежд\p{L}*|варнинг\p{L}*|(?:^|[^\p{L}])warn(?:ing)?s?(?=$|[^\p{L}])/iu.test(t))out.levels=['warn'];
 const svc=/(?:сервис\p{L}*|приложени\p{L}*|деплойме?нт\p{L}*|deployment|service|под\p{L}*|pod|app)\s+[«"'`]?([A-Za-z0-9][A-Za-z0-9._/-]{0,62})/iu.exec(t);
 if(svc&&!STOP.has(svc[1].toLowerCase()))out.services.push(svc[1].replace(/[.,]+$/,''));
 const quoted=[...t.matchAll(/[«"'`]([^»"'`\n]{2,80})[»"'`]/g)].map(m=>m[1].trim()).filter(q=>!out.services.includes(q));
 out.contains.push(...quoted);
 if(!out.services.length){
  const named=/(?:логи|логах|логов|лог|ошибки|ошибок)\s+([a-z][a-z0-9._-]{1,62})(?=$|[^\p{L}\d._-])/iu.exec(t);
  if(named&&!STOP.has(named[1].toLowerCase()))out.services.push(named[1]);
 }
 return out;
}
// The model reads the request and writes the query for one source under a strict schema. Whatever it answers,
// `bound` checks it again: an invalid query falls back to the structured filters.
const SCHEMA={type:'object',additionalProperties:false,properties:{
 query:{type:'string',maxLength:CAPS.query},
 levels:{type:'array',items:{type:'string',enum:LEVELS},maxItems:5},
 services:{type:'array',items:{type:'string',maxLength:63},maxItems:CAPS.filters},
 contains:{type:'array',items:{type:'string',maxLength:CAPS.filter},maxItems:CAPS.filters},
 last:{type:'string',enum:['15m','30m','1h','3h','6h','12h','24h','2d','3d','7d']},
 limit:{type:'integer',minimum:1,maximum:CAPS.maxLimit}},required:['query','levels','services','contains','last']};
const LANGUAGE_HELP={
 logql:'LogQL Loki: только запрос строк — селектор {метка="значение"} и фильтры |= "текст", != "текст", |~ "(?i)regex", | json, | метка="значение". Никаких count_over_time, sum, rate, line_format.',
 kql:'KQL (Kibana): поле:значение, поле:"фраза", поле:(a or b), слова и "фразы", and/or/not, скобки. Без диапазонов и без * в начале слова.',
 text:'Простой текст для поиска в строках (одно слово или фраза), без операторов.'
};
async function translate(s,request,source,{model=require('../extensions/app-kit.cjs').modelJSON}={}){
 const p=source.source||source;
 const raw=await model(s,{system:'Ты переводишь просьбу посмотреть логи сервера в запрос к источнику логов «'+(source.name||p.name)+'». '+LANGUAGE_HELP[p.language]+(p.prompt?' '+p.prompt:'')+
  ' Логи пишут по-английски: русские слова предмета переводи в английские ключевые слова (оплата → payment). query — запрос на языке источника (или пустая строка), levels — уровни (ошибки → error и fatal), services — имена сервисов, если названы, contains — английские слова для поиска, last — период. Ничего не выдумывай: если сервис не назван, services пустой.',
  user:request,schema:SCHEMA,predict:400,temperature:0}).catch(()=>null);
 if(!raw||typeof raw!=='object')return null;
 return {query:typeof raw.query==='string'?raw.query:'',levels:raw.levels,services:raw.services,contains:raw.contains,range:{last:raw.last},limit:raw.limit};
}

// --- The registry bound to live services ---------------------------------------------------------------------------
function create(s,{sources=load(),now=()=>Date.now()}={}){
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const connected=x=>{try{return !!x.source.ready(s.settings||{});}catch{return false;}};
 const ready=x=>added(x)&&connected(x);
 const find=id=>sources.find(x=>x.id===id)||null;
 const live=id=>{const x=find(id);if(!x)throw Error('Нет такого источника логов.');if(!ready(x))throw Error('Источник логов «'+x.name+'» не добавлен или не подключён.');return x;};
 const hint=x=>{try{return typeof x.source.hint==='function'?String(x.source.hint(s.settings||{})||''):'';}catch{return '';}};
 const describe=x=>({id:x.id,name:x.name,extension:x.extension,language:x.source.language,added:added(x),connected:connected(x),ready:ready(x),hint:hint(x)});
 const named=command=>sources.filter(x=>(x.source.names||[]).some(r=>{r.lastIndex=0;return r.test(String(command||''));})).map(x=>x.id);
 // One search: the spec is bounded again (callers may pass anything), the answer normalized and capped.
 async function search(id,raw,{check=()=>{}}={}){
  const x=live(id);
  const spec=bound(raw||{},x,{now:now(),settings:s.settings||{}});
  const r=await x.source.search(s,spec,{check});
  check();
  if(!r||!Array.isArray(r.entries))throw Error(x.name+' вернул некорректный ответ.');
  const from=spec.range.from,to=spec.range.to;
  const entries=r.entries.slice(0,spec.limit*2).map(e=>entry(e,x.id)).filter(e=>e.ts&&e.ts>=from&&e.ts<=to)
   .sort((a,b)=>b.ts.localeCompare(a.ts)).slice(0,spec.limit);
  const total=Number.isFinite(Number(r.total))&&Number(r.total)>=entries.length?Math.round(Number(r.total)):entries.length;
  let explore=null;try{const e=typeof x.source.explore==='function'?x.source.explore(s.settings||{},spec):null;if(e&&/^https?:\/\//.test(e.url))explore={label:text(e.label,60),url:String(e.url)};}catch{explore=null;}
  return {source:{id:x.id,name:x.name,language:x.source.language},spec,entries,histogram:sourceHistogram(r.histogram,spec)||histogram(entries,spec),
   groups:groups(entries),total,truncated:!!r.truncated||total>entries.length,notes:[...spec.notes,...(Array.isArray(r.notes)?r.notes.map(n=>text(n,300)):[])].slice(0,6),explore};
 }
 async function services(id,raw={}){
  const x=live(id);if(typeof x.source.services!=='function')return [];
  const spec=bound(raw,x,{now:now(),settings:s.settings||{}});
  const out=await x.source.services(s,spec);
  return (Array.isArray(out)?out:[]).map(v=>text(v,63)).filter(v=>SERVICE.test(v)).slice(0,50);
 }
 return {all:()=>sources.map(describe),list:()=>sources.filter(ready).map(describe),find:id=>{const x=find(id);return x?describe(x):null;},named,
  bound:(id,raw)=>bound(raw||{},live(id),{now:now(),settings:s.settings||{}}),search,services,
  translate:(id,request,opts)=>translate(s,request,live(id),opts)};
}

module.exports={name:'logSources',defaults:{},validate(){},KIND,LEVELS,CAPS,SCHEMA,load,create,entry,levelOf,levelName,serviceOf,range,duration,
 validateLogQL,parseKQL,validateQuery,bound,histogram,stepFor,signature,groups,parse,translate,directory:path.join(__dirname,'../extensions'),
 setup(s){return {logSources:create(s)};}};
